import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import {
  scanStep,
  scanAllTranscripts,
  collectScanTargets,
  freshTargets,
  type ScanTarget,
} from "../../src/main/analytics/scan";
import * as analytics from "../../src/main/db/analytics";
import {
  migrateAnalytics,
  readTotals,
  readProcessedFiles,
} from "../../src/main/db/analytics";
import { openTestDb } from "../helpers/sqlite";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-scanstep-");

const assistantLine = (id: string, input: number) => ({
  type: "assistant",
  cwd: "/work/proj",
  gitBranch: "main",
  timestamp: "2020-01-01T00:00:00.000Z",
  message: {
    role: "assistant",
    id,
    model: "claude-opus-4-8",
    usage: {
      input_tokens: input,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    content: [{ type: "text", text: "ok" }],
  },
});

/** Write projects/<proj>/<id>.jsonl from assistant turns with an explicit mtime. */
function writeTurns(
  home: string,
  proj: string,
  id: string,
  turns: { id: string; input: number }[],
  mtimeMs: number,
): void {
  const dir = join(home, "projects", proj);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  writeFileSync(
    path,
    turns.map((t) => JSON.stringify(assistantLine(t.id, t.input))).join("\n") +
      "\n",
  );
  utimesSync(path, new Date(mtimeMs), new Date(mtimeMs));
}

const MT = 1_700_000_000_000;

describe("scanStep (chunked incremental engine)", () => {
  it("chunked passes converge to the same totals as a single pass", () => {
    const home = makeHome();
    writeTurns(
      home,
      "-a",
      "s1",
      [
        { id: "a1", input: 1 },
        { id: "a2", input: 2 },
        { id: "a3", input: 3 },
      ],
      MT,
    );
    writeTurns(
      home,
      "-b",
      "s2",
      [
        { id: "b1", input: 10 },
        { id: "b2", input: 20 },
      ],
      MT,
    );

    // Single pass: one effectively-unbounded step.
    const single = openTestDb();
    migrateAnalytics(single);
    const sp = scanStep(single, home, 1_000_000);
    expect(sp.done).toBe(true);

    // Chunked: one line at a time, forcing a large append to split mid-file across steps.
    const chunked = openTestDb();
    migrateAnalytics(chunked);
    let guard = 0;
    while (!scanStep(chunked, home, 1).done) {
      if (++guard > 10_000) throw new Error("scan did not converge");
    }

    expect(readTotals(chunked)).toEqual(readTotals(single));
    expect(readTotals(chunked).turns).toBe(5);
    expect(readTotals(chunked).inputTokens).toBe(36);
  });

  it("a no-change re-run is a no-op", () => {
    const home = makeHome();
    writeTurns(home, "-a", "s1", [{ id: "a1", input: 5 }], MT);
    const db = openTestDb();
    migrateAnalytics(db);
    scanAllTranscripts(db, home);
    const first = readTotals(db);

    const again = scanStep(db, home, 1_000_000);
    expect(again.done).toBe(true);
    expect(readTotals(db)).toEqual(first); // unchanged files skipped by mtime
  });

  it("reads only the appended lines on a later pass (warm refresh)", () => {
    const home = makeHome();
    writeTurns(home, "-a", "s1", [{ id: "a1", input: 100 }], MT);
    const db = openTestDb();
    migrateAnalytics(db);
    scanAllTranscripts(db, home);
    expect(
      readProcessedFiles(db).get(join(home, "projects", "-a", "s1.jsonl"))!
        .lines,
    ).toBe(1);

    // A second turn lands in the same Session; mtime bumps. The warm pass ingests only line 2.
    writeTurns(
      home,
      "-a",
      "s1",
      [
        { id: "a1", input: 100 },
        { id: "a2", input: 250 },
      ],
      MT + 1000,
    );
    scanAllTranscripts(db, home);

    const t = readTotals(db);
    expect(t.turns).toBe(2);
    expect(t.inputTokens).toBe(350); // 100 + 250, first turn neither dropped nor doubled
    expect(
      readProcessedFiles(db).get(join(home, "projects", "-a", "s1.jsonl"))!
        .lines,
    ).toBe(2);
  });

  it("re-reads a shrunk (truncated/rotated) transcript from zero", () => {
    const home = makeHome();
    writeTurns(
      home,
      "-a",
      "s1",
      [
        { id: "a1", input: 100 },
        { id: "a2", input: 200 },
      ],
      MT,
    );
    const db = openTestDb();
    migrateAnalytics(db);
    scanAllTranscripts(db, home);

    // The file is rewritten shorter (fewer complete lines) with a fresh turn at line 0 — the shrink path
    // must re-read from zero, ingesting the new content rather than treating it as "no appended lines".
    writeTurns(home, "-a", "s1", [{ id: "a3", input: 900 }], MT + 1000);
    scanAllTranscripts(db, home);

    // a3 was ingested (re-read from zero). a1/a2 linger — turns aren't path-linked, so we don't purge
    // rows whose lines vanished; in practice rotation creates a NEW Session file, so this is a rare edge.
    const t = readTotals(db);
    expect(t.inputTokens).toBe(1200); // 100 + 200 + 900 — proves the truncated file was re-read
    expect(
      readProcessedFiles(db).get(join(home, "projects", "-a", "s1.jsonl"))!
        .lines,
    ).toBe(1);
  });

  it("reports progress: filesTotal, filesDone, and done", () => {
    const home = makeHome();
    writeTurns(home, "-a", "s1", [{ id: "a1", input: 1 }], MT);
    writeTurns(home, "-b", "s2", [{ id: "b1", input: 1 }], MT);
    const db = openTestDb();
    migrateAnalytics(db);

    const p = scanStep(db, home, 1_000_000);
    expect(p).toEqual({ filesTotal: 2, filesDone: 2, done: true, wrote: true });
  });

  it("an unreadable target doesn't block done or stall the scan (it converges, readable files ingest)", () => {
    const home = makeHome();
    writeTurns(home, "-a", "s1", [{ id: "a1", input: 7 }], MT);
    // A directory whose name ends in .jsonl: indexTranscripts enumerates it and statSync succeeds, but
    // readFileSync throws EISDIR on every pass. It must not keep the scan from ever reaching done — a
    // perpetually-pending target would pin the Stats poll at the brisk 40ms cadence forever.
    mkdirSync(join(home, "projects", "-b", "s2.jsonl"), { recursive: true });

    const db = openTestDb();
    migrateAnalytics(db);

    const p = scanStep(db, home, 1_000_000);
    expect(p.done).toBe(true); // converges despite the unreadable target
    expect(p.filesTotal).toBe(2);
    expect(readTotals(db).turns).toBe(1); // the readable transcript is still ingested
    expect(readTotals(db).inputTokens).toBe(7);
  });

  it("collectScanTargets enumerates parent transcripts and their subagent files", () => {
    const home = makeHome();
    writeTurns(home, "-a", "s1", [{ id: "a1", input: 1 }], MT);
    const subDir = join(home, "projects", "-a", "s1", "subagents");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(
      join(subDir, "agent-x.jsonl"),
      JSON.stringify(assistantLine("sub-1", 7)) + "\n",
    );

    const targets = collectScanTargets(home);
    expect(targets).toHaveLength(2);
    const sub = targets.find((t) => t.path.endsWith("agent-x.jsonl"))!;
    expect(sub.sessionId).toBe("s1");
    expect(sub.keyPrefix).toBe("s1/agent-x.jsonl");
  });

  it("reads processed_files once per step", () => {
    const home = makeHome();
    writeTurns(home, "-a", "s1", [{ id: "a1", input: 1 }], MT);
    writeTurns(home, "-b", "s2", [{ id: "b1", input: 1 }], MT);
    const db = openTestDb();
    migrateAnalytics(db);

    const spy = vi.spyOn(analytics, "readProcessedFiles");
    scanStep(db, home, 1_000_000);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("reports `wrote` only on a step that ingests turns", () => {
    const home = makeHome();
    writeTurns(home, "-a", "s1", [{ id: "a1", input: 1 }], MT);
    const db = openTestDb();
    migrateAnalytics(db);

    expect(scanStep(db, home, 1_000_000).wrote).toBe(true); // first pass ingests the turn
    expect(scanStep(db, home, 1_000_000).wrote).toBe(false); // nothing changed: a no-op
  });

  it("re-reads a shrunk file in place and reports the re-ingest via `wrote`", () => {
    // A shrink (fewer complete lines than stored) re-reads from zero, re-upserting existing message_ids
    // WITHOUT moving the max rowid — so `wrote` is the only signal a poll's change token can lean on.
    const home = makeHome();
    writeTurns(
      home,
      "-a",
      "s1",
      [
        { id: "a1", input: 1 },
        { id: "a2", input: 2 },
      ],
      MT,
    );
    const db = openTestDb();
    migrateAnalytics(db);
    expect(scanStep(db, home, 1_000_000).wrote).toBe(true);

    // Rewrite shorter (one line) with a bumped mtime: re-read from zero re-upserts a1 in place.
    writeTurns(home, "-a", "s1", [{ id: "a1", input: 9 }], MT + 1000);
    const after = scanStep(db, home, 1_000_000);
    expect(after.wrote).toBe(true); // re-ingest detected even though no new rowid lands
  });

  it("progressive usage snapshots converge to the final value at every chunk size", () => {
    // A subagent-style turn written as three growing snapshots of one message id. Under
    // first-entry-wins the stored row depended on WHERE the chunk boundary fell (nondeterministic
    // output totals across restarts); last-entry-wins must land on the final snapshot always.
    const home = makeHome();
    const dir = join(home, "projects", "-p");
    mkdirSync(dir, { recursive: true });
    const snap = (out: number) =>
      JSON.stringify({
        type: "assistant",
        cwd: "/work/proj",
        timestamp: "2020-01-01T00:00:00.000Z",
        message: {
          role: "assistant",
          id: "grow-1",
          model: "claude-opus-4-8",
          usage: {
            input_tokens: 7,
            output_tokens: out,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          content: [{ type: "text", text: "…" }],
        },
      });
    const path = join(dir, "s-grow.jsonl");
    writeFileSync(path, [snap(0), snap(0), snap(764)].join("\n") + "\n");
    utimesSync(path, new Date(MT), new Date(MT));

    for (const maxLines of [1, 2, 1_000_000]) {
      const db = openTestDb();
      migrateAnalytics(db);
      while (!scanStep(db, home, maxLines).done) {
        // drain the chunked scan
      }
      const totals = readTotals(db);
      expect(totals.turns).toBe(1);
      expect(totals.outputTokens).toBe(764); // the LAST snapshot, regardless of chunking
      expect(totals.inputTokens).toBe(7);
    }
  });
});

describe("freshTargets (walk cache)", () => {
  const target = (path: string): ScanTarget => ({
    path,
    mtimeMs: 1,
    sessionId: "s",
    keyPrefix: "s",
  });

  it("walks when there is no cache, reuses within the TTL, re-walks past it", () => {
    let walks = 0;
    const walk = (): ScanTarget[] => {
      walks++;
      return [target(`/p/${walks}.jsonl`)];
    };
    const TTL = 500;

    const a = freshTargets(null, 1000, TTL, walk);
    expect(walks).toBe(1);

    const b = freshTargets(a, 1000 + 499, TTL, walk);
    expect(walks).toBe(1);
    expect(b).toBe(a);

    const c = freshTargets(b, 1000 + 500, TTL, walk);
    expect(walks).toBe(2);
    expect(c.atMs).toBe(1500);
    expect(c.targets).not.toBe(a.targets);
  });
});
