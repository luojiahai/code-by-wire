import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectCodexScanTargets,
  extractCodexTurns,
  scanCodexStep,
} from "../../src/main/analytics/codex-scan";
import {
  migrateAnalytics,
  readProcessedFiles,
  readTotals,
} from "../../src/main/db/analytics";
import { openTestDb } from "../helpers/sqlite";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-codex-analytics-");
const ID = "11111111-2222-3333-4444-555555555555";

const line = (value: unknown): string => JSON.stringify(value);
const context = (model: string): string =>
  line({ type: "turn_context", payload: { model } });
const token = (
  timestamp: string,
  input: number,
  cached: number,
  output: number,
  cacheWrite = 0,
): string =>
  line({
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: cached,
          cache_write_input_tokens: cacheWrite,
          output_tokens: output,
          total_tokens: input + output,
        },
      },
    },
  });

function rollout(home: string, content: string): string {
  const day = join(home, "sessions", "2026", "07", "22");
  mkdirSync(day, { recursive: true });
  const path = join(day, `rollout-2026-07-22T09-00-00-${ID}.jsonl`);
  writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`);
  return path;
}

describe("Codex analytics scan", () => {
  it("extracts non-zero cumulative deltas with model, timestamp, cwd, and stable line keys", () => {
    const jsonl = [
      line({ type: "session_meta", payload: { id: ID, cwd: "/work/app" } }),
      context("gpt-5.3-codex"),
      token("2026-07-22T09:00:10.000Z", 1000, 600, 100, 20),
      token("2026-07-22T09:00:20.000Z", 1500, 700, 180, 30),
    ].join("\n");
    const turns = extractCodexTurns(jsonl, ID, `codex:${ID}`, "/work/app");
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      messageId: `codex:${ID}:2`,
      sessionId: ID,
      agent: "codex",
      modelRaw: "gpt-5.3-codex",
      cwd: "/work/app",
      project: "app",
      ts: Date.parse("2026-07-22T09:00:10.000Z"),
      usage: {
        inputTokens: 400,
        outputTokens: 100,
        cacheReadTokens: 600,
        cacheCreationTokens: 20,
        cacheCreation5mTokens: 0,
        cacheCreation1hTokens: 0,
      },
    });
    expect(turns[1].usage).toMatchObject({
      inputTokens: 400,
      outputTokens: 80,
      cacheReadTokens: 100,
      cacheCreationTokens: 10,
    });
  });

  it("skips malformed/rate-limit/all-zero reset events and accepts the event-model fallback", () => {
    const jsonl = [
      "{broken",
      line({
        type: "event_msg",
        payload: { type: "token_count", info: null },
      }),
      line({
        timestamp: "2026-07-22T09:00:10.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            model_name: "gpt-5-mini",
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 0,
              output_tokens: 10,
              total_tokens: 110,
            },
          },
        },
      }),
      token("2026-07-22T09:00:20.000Z", 20, 0, 2),
    ].join("\n");
    const turns = extractCodexTurns(jsonl, ID, `codex:${ID}`, "");
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      modelRaw: "gpt-5-mini",
      cwd: "",
      project: "",
    });
  });

  it("walks rollouts and re-parses changed files whole without double-counting", () => {
    const home = makeHome();
    const path = rollout(
      home,
      [
        line({ type: "session_meta", payload: { id: ID, cwd: "/w/p" } }),
        context("gpt-5.3-codex"),
        token("2026-07-22T09:00:10.000Z", 50, 10, 5),
      ].join("\n"),
    );
    const db = openTestDb();
    migrateAnalytics(db);
    const targets = collectCodexScanTargets(home);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      path,
      sessionId: ID,
      keyPrefix: `codex:${ID}`,
    });
    expect(scanCodexStep(db, home, 5000, targets)).toMatchObject({
      filesTotal: 1,
      filesDone: 1,
      done: true,
      wrote: true,
    });
    expect(readTotals(db, undefined, "codex").turns).toBe(1);

    const changedTargets = targets.map((target) => ({
      ...target,
      mtimeMs: target.mtimeMs + 1,
    }));
    scanCodexStep(db, home, 5000, changedTargets);
    expect(readTotals(db, undefined, "codex")).toMatchObject({
      turns: 1,
      inputTokens: 40,
      cacheReadTokens: 10,
      outputTokens: 5,
    });
  });

  // Regression: a 1.4GB Codex rollout crashed the packaged app ~2.5s into launch. This loop reads each
  // pending file whole BEFORE its `completeLines > remaining` budget check, so the first pending
  // rollout is read at any size — and a utf8 read past V8's string cap aborts Electron's main process
  // outright (SIGTRAP), which the surrounding try/catch cannot intercept.
  it("skips a rollout too large to read whole instead of reading it", () => {
    const home = makeHome();
    const db = openTestDb();
    migrateAnalytics(db);
    const path = rollout(
      home,
      [
        line({ type: "session_meta", payload: { id: ID, cwd: "/work/app" } }),
        context("gpt-5.3-codex"),
        token("2026-07-22T09:00:10.000Z", 1000, 600, 100, 20),
      ].join("\n"),
    );
    const targets = collectCodexScanTargets(home);
    expect(targets).toHaveLength(1);

    // A byte cap far below the fixture stands in for the real 512MB cap.
    const progress = scanCodexStep(db, home, 5000, targets, 8);

    // Skipped, not read: no turns ingested...
    expect(readTotals(db, undefined, "codex").turns).toBe(0);
    // ...but recorded, so it stops being pending and the scan can still settle `done`.
    expect(progress).toMatchObject({ filesDone: 1, done: true, wrote: false });
    expect(readProcessedFiles(db).get(path)?.mtime).toBeGreaterThan(0);
  });

  it("still ingests a rollout that fits under the byte cap", () => {
    const home = makeHome();
    const db = openTestDb();
    migrateAnalytics(db);
    rollout(
      home,
      [
        line({ type: "session_meta", payload: { id: ID, cwd: "/work/app" } }),
        context("gpt-5.3-codex"),
        token("2026-07-22T09:00:10.000Z", 1000, 600, 100, 20),
      ].join("\n"),
    );
    const progress = scanCodexStep(
      db,
      home,
      5000,
      collectCodexScanTargets(home),
      1_000_000,
    );
    expect(readTotals(db, undefined, "codex").turns).toBe(1);
    expect(progress).toMatchObject({ done: true, wrote: true });
  });
});
