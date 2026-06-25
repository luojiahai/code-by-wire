import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import {
  summarize,
  listCandidates,
} from "../../src/main/provider/claude/discover";
import type { SessionCandidate } from "@shared/types";
import {
  extractTurns,
  foldTurnsByModel,
} from "../../src/main/provider/claude/turns";
import { tempHomes } from "../helpers/temp-home";
import { usageByModelFor } from "../../src/main/provider/claude/usage-by-model";
import { scanAllTranscripts } from "../../src/main/analytics/scan";
import {
  migrateAnalytics,
  readTotals,
  readByModel,
} from "../../src/main/db/analytics";
import { openTestDb } from "../helpers/sqlite";
import { equivApiValueByModel } from "../../src/shared/usage-by-model";

/** One assistant JSONL line with a given model + input tokens. */
const assistant = (id: string, model: string, input: number): string =>
  JSON.stringify({
    type: "assistant",
    cwd: "/work/proj",
    gitBranch: "main",
    timestamp: "2026-06-09T03:00:00.000Z",
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

describe("foldTurnsByModel", () => {
  it("folds turns into one entry per model, summed, biggest first", () => {
    const jsonl = [
      assistant("m1", "claude-opus-4-8", 100),
      assistant("m2", "claude-opus-4-8", 50),
      assistant("m3", "claude-sonnet-4-6", 30),
    ].join("\n");
    const folded = foldTurnsByModel(extractTurns(jsonl, "sess-1"));
    expect(folded).toEqual([
      {
        modelRaw: "claude-opus-4-8",
        usage: expect.objectContaining({ inputTokens: 150 }),
      },
      {
        modelRaw: "claude-sonnet-4-6",
        usage: expect.objectContaining({ inputTokens: 30 }),
      },
    ]);
  });

  it("folds a turn with no model under null", () => {
    const noModel = JSON.stringify({
      type: "assistant",
      timestamp: "2026-06-09T03:00:00.000Z",
      message: {
        role: "assistant",
        id: "x",
        usage: { input_tokens: 7 },
        content: [],
      },
    });
    const folded = foldTurnsByModel(extractTurns(noModel, "sess-1"));
    expect(folded).toHaveLength(1);
    expect(folded[0].modelRaw).toBeNull();
    expect(folded[0].usage.inputTokens).toBe(7);
  });
});

const makeHome = tempHomes("cbw-ubm-");

/** Write projects/<proj>/<id>.jsonl from assistant lines; returns its absolute path. */
function writeMain(
  home: string,
  proj: string,
  id: string,
  lines: string[],
): string {
  const dir = join(home, "projects", proj);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

/** Write projects/<proj>/<id>/subagents/agent-<agentId>.jsonl. */
function writeSubagent(
  home: string,
  proj: string,
  id: string,
  agentId: string,
  lines: string[],
): void {
  const dir = join(home, "projects", proj, id, "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `agent-${agentId}.jsonl`), lines.join("\n") + "\n");
}

describe("usageByModelFor", () => {
  it("folds the main transcript with each subagent transcript by model", () => {
    const home = makeHome();
    const path = writeMain(home, "-work-proj", "sess-1", [
      assistant("m1", "claude-opus-4-8", 1000),
    ]);
    writeSubagent(home, "-work-proj", "sess-1", "aaa", [
      assistant("s1", "claude-sonnet-4-6", 200),
    ]);
    writeSubagent(home, "-work-proj", "sess-1", "bbb", [
      assistant("h1", "claude-haiku-4-5", 50),
    ]);

    const main = readFileSync(path, "utf8");
    const folded = usageByModelFor(main, path, "sess-1");

    const byRaw = Object.fromEntries(
      folded.map((m) => [m.modelRaw, m.usage.inputTokens]),
    );
    expect(byRaw["claude-opus-4-8"]).toBe(1000);
    expect(byRaw["claude-sonnet-4-6"]).toBe(200);
    expect(byRaw["claude-haiku-4-5"]).toBe(50);

    // Per-model entries sum to the combined input total.
    const combined = folded.reduce((n, m) => n + m.usage.inputTokens, 0);
    expect(combined).toBe(1250);
  });

  it("returns the main-only breakdown when there is no subagents dir", () => {
    const home = makeHome();
    const path = writeMain(home, "-work-proj", "sess-2", [
      assistant("m1", "claude-opus-4-8", 42),
    ]);
    const folded = usageByModelFor(readFileSync(path, "utf8"), path, "sess-2");
    expect(folded).toHaveLength(1);
    expect(folded[0]).toMatchObject({ modelRaw: "claude-opus-4-8" });
  });
});

describe("summarize includes the per-model breakdown", () => {
  it("folds main + subagent usage onto the snapshot", () => {
    const home = makeHome();
    const path = writeMain(home, "-work-proj", "sess-9", [
      assistant("m1", "claude-opus-4-8", 1000),
    ]);
    writeSubagent(home, "-work-proj", "sess-9", "aaa", [
      assistant("s1", "claude-sonnet-4-6", 200),
    ]);

    const cand: SessionCandidate = {
      id: "sess-9",
      alive: false,
      cwd: "/work/proj",
      transcriptPath: path,
      transcriptMtimeMs: 1,
    };
    const snap = summarize(cand);
    const byRaw = Object.fromEntries(
      (snap.usageByModel ?? []).map((m) => [m.modelRaw, m.usage.inputTokens]),
    );
    expect(byRaw["claude-opus-4-8"]).toBe(1000);
    expect(byRaw["claude-sonnet-4-6"]).toBe(200);
  });

  it("yields an empty breakdown when there is no transcript", () => {
    const snap = summarize({
      id: "x",
      alive: false,
      cwd: "/work/proj",
      transcriptMtimeMs: 0,
    });
    expect(snap.usageByModel).toEqual([]);
  });
});

describe("reconciliation with the analytics scan", () => {
  it("the panel's equiv equals the overview's total for the same files", () => {
    const home = makeHome();
    const path = writeMain(home, "-work-proj", "sess-1", [
      assistant("m1", "claude-opus-4-8", 1000),
      assistant("m2", "claude-opus-4-8", 500),
    ]);
    writeSubagent(home, "-work-proj", "sess-1", "aaa", [
      assistant("s1", "claude-sonnet-4-6", 800),
    ]);
    writeSubagent(home, "-work-proj", "sess-1", "bbb", [
      assistant("h1", "claude-haiku-4-5", 400),
    ]);

    // Overview path: scan every file into the analytics store.
    const db = openTestDb();
    migrateAnalytics(db);
    scanAllTranscripts(db, home);
    const totals = readTotals(db);

    // Panel path: fold the same session's files.
    const folded = usageByModelFor(readFileSync(path, "utf8"), path, "sess-1");

    // The reconciliation guarantee: same extraction → same equiv, by construction.
    expect(equivApiValueByModel(folded)).toBeCloseTo(totals.equivApiValueUsd);

    // Per-model token totals match the overview's per-model breakdown for this single-session fixture.
    const overviewByRaw = Object.fromEntries(
      readByModel(db).map((r) => [r.modelRaw, r.totalTokens]),
    );
    for (const m of folded) {
      const total =
        m.usage.inputTokens +
        m.usage.outputTokens +
        m.usage.cacheReadTokens +
        m.usage.cacheCreationTokens;
      expect(overviewByRaw[m.modelRaw as string]).toBe(total);
    }
  });
});

describe("listCandidates folds the subagents-dir mtime into the reparse trigger", () => {
  it("a newer subagent file advances the candidate's transcriptMtimeMs", () => {
    const home = makeHome();
    const path = writeMain(home, "-work-proj", "sess-7", [
      assistant("m1", "claude-opus-4-8", 10),
    ]);
    // Main transcript is older; the subagent file is newer.
    const oldMs = 1_700_000_000_000;
    const newMs = 1_700_000_500_000;
    utimesSync(path, new Date(oldMs), new Date(oldMs));
    writeSubagent(home, "-work-proj", "sess-7", "aaa", [
      assistant("s1", "claude-sonnet-4-6", 5),
    ]);
    const subFile = join(
      home,
      "projects",
      "-work-proj",
      "sess-7",
      "subagents",
      "agent-aaa.jsonl",
    );
    utimesSync(subFile, new Date(newMs), new Date(newMs));

    const cands = listCandidates({
      claudeDir: home,
      isPidAlive: () => false,
      now: newMs + 1000,
      recentWindowMs: 7 * 24 * 60 * 60 * 1000,
    });
    const c = cands.find((x) => x.id === "sess-7");
    expect(c).toBeDefined();
    // The trigger reflects the newer subagent mtime, not the older main transcript mtime.
    expect(c!.transcriptMtimeMs).toBeCloseTo(newMs, -2);
  });
});
