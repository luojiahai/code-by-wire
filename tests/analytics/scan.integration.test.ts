import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { scanAllTranscripts } from "../../src/main/analytics/scan";
import { migrateAnalytics, readTotals } from "../../src/main/db/analytics";
import { openTestDb } from "../helpers/sqlite";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-scan-");

/** Write a transcript JSONL of arbitrary lines under projects/<proj>/<id>.jsonl with an explicit mtime. */
function writeTranscript(
  home: string,
  proj: string,
  id: string,
  lines: unknown[],
  mtimeMs: number,
): void {
  const dir = join(home, "projects", proj);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  utimesSync(path, new Date(mtimeMs), new Date(mtimeMs));
}

/** Write a subagent transcript under projects/<proj>/<id>/subagents/agent-<agentId>.jsonl — where
 *  Claude actually stores subagent turns (never inline in the parent). */
function writeSubagentTranscript(
  home: string,
  proj: string,
  id: string,
  agentId: string,
  lines: unknown[],
): void {
  const dir = join(home, "projects", proj, id, "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `agent-${agentId}.jsonl`),
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
}

const assistantLine = (id: string, model: string, input: number) => ({
  type: "assistant",
  cwd: "/work/proj",
  gitBranch: "main",
  timestamp: "2020-01-01T00:00:00.000Z",
  message: {
    role: "assistant",
    id,
    model,
    usage: {
      input_tokens: input,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    content: [{ type: "text", text: "ok" }],
  },
});

const ANCIENT = 1_000_000_000_000; // year 2001, far outside any recency window

describe("scanAllTranscripts (real disk walk, scratch analytics db)", () => {
  it("ingests every transcript including ancient ones, excludes synthetic, includes sidechain", () => {
    const home = makeHome();
    // An ancient transcript the live index would prune: must still be ingested.
    writeTranscript(
      home,
      "-work-old",
      "sess-old",
      [
        { type: "user", message: { role: "user", content: "hi" } },
        assistantLine("old-1", "claude-opus-4-8", 100),
      ],
      ANCIENT,
    );
    // A second session with a synthetic placeholder (skipped) and a sidechain turn (counted).
    writeTranscript(
      home,
      "-work-new",
      "sess-new",
      [
        {
          type: "assistant",
          message: {
            role: "assistant",
            id: "syn",
            model: "<synthetic>",
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        },
        {
          ...assistantLine("side-1", "claude-sonnet-4-6", 200),
          isSidechain: true,
        },
      ],
      ANCIENT,
    );

    const db = openTestDb();
    migrateAnalytics(db);
    scanAllTranscripts(db, home);

    const t = readTotals(db);
    expect(t.sessions).toBe(2); // both sessions contributed a real turn
    expect(t.turns).toBe(2); // synthetic excluded; sidechain included
    expect(t.inputTokens).toBe(300);
  });

  it("is idempotent: a second scan does not double-count", () => {
    const home = makeHome();
    writeTranscript(
      home,
      "-work-a",
      "sess-a",
      [assistantLine("a-1", "claude-opus-4-8", 500)],
      ANCIENT,
    );

    const db = openTestDb();
    migrateAnalytics(db);
    scanAllTranscripts(db, home);
    const first = readTotals(db);
    scanAllTranscripts(db, home); // re-run over unchanged files
    expect(readTotals(db)).toEqual(first);
  });

  it("re-reads only the appended lines on a later pass (append-only), no double-count", () => {
    const home = makeHome();
    writeTranscript(
      home,
      "-work-a",
      "sess-a",
      [assistantLine("a-1", "claude-opus-4-8", 500)],
      ANCIENT,
    );

    const db = openTestDb();
    migrateAnalytics(db);
    scanAllTranscripts(db, home);
    expect(readTotals(db).inputTokens).toBe(500);

    // The Session continues: a second turn is appended and the file's mtime bumps. The next scan ingests
    // only the new line; the first turn is neither dropped nor double-counted.
    writeTranscript(
      home,
      "-work-a",
      "sess-a",
      [
        assistantLine("a-1", "claude-opus-4-8", 500),
        assistantLine("a-2", "claude-opus-4-8", 400),
      ],
      ANCIENT + 1000,
    );
    scanAllTranscripts(db, home);
    const t = readTotals(db);
    expect(t.turns).toBe(2);
    expect(t.inputTokens).toBe(900); // 500 + 400, not 1400
  });

  it("ingests nothing from an empty home without throwing", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    scanAllTranscripts(db, makeHome());
    expect(readTotals(db).turns).toBe(0);
  });

  it("counts subagent turns from subagents/agent-*.jsonl, attributed to the parent session", () => {
    const home = makeHome();
    // The parent transcript carries only its own turn — real subagent turns live in the sibling
    // subagents/ dir, never inline (current Claude transcripts have zero inline isSidechain rows).
    writeTranscript(
      home,
      "-work-p",
      "sess-p",
      [assistantLine("parent-1", "claude-opus-4-8", 100)],
      ANCIENT,
    );
    writeSubagentTranscript(home, "-work-p", "sess-p", "aaa", [
      { ...assistantLine("sub-1", "claude-haiku-4-5", 30), isSidechain: true },
      { ...assistantLine("sub-2", "claude-haiku-4-5", 70), isSidechain: true },
    ]);

    const db = openTestDb();
    migrateAnalytics(db);
    scanAllTranscripts(db, home);

    const t = readTotals(db);
    expect(t.turns).toBe(3); // 1 parent + 2 subagent turns
    expect(t.sessions).toBe(1); // subagents roll up under the parent, no phantom session
    expect(t.inputTokens).toBe(200); // 100 + 30 + 70
  });

  it("is idempotent across a re-scan that includes subagent turns", () => {
    const home = makeHome();
    writeTranscript(
      home,
      "-work-p",
      "sess-p",
      [assistantLine("parent-1", "claude-opus-4-8", 100)],
      ANCIENT,
    );
    writeSubagentTranscript(home, "-work-p", "sess-p", "aaa", [
      { ...assistantLine("sub-1", "claude-haiku-4-5", 30), isSidechain: true },
    ]);

    const db = openTestDb();
    migrateAnalytics(db);
    scanAllTranscripts(db, home);
    const first = readTotals(db);
    scanAllTranscripts(db, home); // re-run over unchanged parent + subagent files
    expect(readTotals(db)).toEqual(first);
  });
});
