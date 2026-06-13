import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { IPC } from "@shared/ipc";
import type { StatsSnapshot, StatsRange } from "@shared/stats";
import type { Provider } from "../src/main/provider/types";

// Capture the handlers registerIpc registers, without a real Electron ipcMain (same shape as ipc.test.ts).
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...a: unknown[]) => unknown>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: (...a: unknown[]) => unknown) =>
      handlers.set(channel, fn),
  },
}));

import { registerIpc } from "../src/main/ipc";
import { migrate } from "../src/main/db/store";
import { migrateAnalytics, upsertTurns } from "../src/main/db/analytics";
import { openTestDb } from "./helpers/sqlite";
import { tempHomes } from "./helpers/temp-home";

const makeHome = tempHomes("cbw-stats-ipc-");

const provider: Provider = {
  id: "fake",
  capabilities: {
    canControl: false,
    hasRateLimits: false,
    hasSubagents: false,
  },
  listCandidates: () => [],
  summarize: (c) => ({
    id: c.id,
    title: "t",
    project: "p",
    state: "idle",
    management: "observed",
    model: "opus",
    lastActivityMs: 0,
    awaitingUser: false,
    transcriptMtimeMs: 0,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
    contextTokens: 0,
  }),
  restate: (_c, prev) => prev,
  readTranscript: () => ({ status: "absent" }),
  readTasks: () => ({ status: "absent" }),
  readMetrics: () => ({ status: "absent" }),
  resolveAdoptTarget: () => null,
};

describe("registerIpc stats:read", () => {
  it("scans the claude dir and returns the aggregated totals", () => {
    const home = makeHome();
    const dir = join(home, "projects", "-work-proj");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "sess-1.jsonl"),
      JSON.stringify({
        type: "assistant",
        cwd: "/work/proj",
        message: {
          role: "assistant",
          id: "m1",
          model: "claude-opus-4-8",
          usage: {
            input_tokens: 1_000_000,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }) + "\n",
    );

    const db = openTestDb();
    migrate(db);
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    registerIpc({ db, provider, analyticsDb, claudeDir: home });

    const snap = handlers.get(IPC.readStats)!() as StatsSnapshot;
    expect(snap.totals.sessions).toBe(1);
    expect(snap.totals.turns).toBe(1);
    expect(snap.totals.inputTokens).toBe(1_000_000);
    expect(snap.totals.equivApiValueUsd).toBeCloseTo(5); // opus $5/M input
    expect(snap.progress.done).toBe(true);
    expect(snap.hasAnyTurns).toBe(true); // a turn was ingested

    // A second call is a no-op: the file is unchanged, so totals hold and it's still done.
    const again = handlers.get(IPC.readStats)!() as StatsSnapshot;
    expect(again.totals).toEqual(snap.totals);
    expect(again.progress.done).toBe(true);
  });

  it("swallows a scan failure and serves last-known totals", () => {
    const home = makeHome();
    // A self-referential projects symlink makes the directory walk throw (ELOOP) — a real read failure,
    // not an empty home. The handler must catch it and serve the last-known totals, never reject.
    symlinkSync(join(home, "projects"), join(home, "projects"));

    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    upsertTurns(analyticsDb, [
      {
        messageId: "seed",
        sessionId: "s",
        ts: 0,
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
        cwd: "/w",
        project: "w",
      },
    ]);

    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider, analyticsDb, claudeDir: home });

    let snap: StatsSnapshot | undefined;
    expect(() => {
      snap = handlers.get(IPC.readStats)!() as StatsSnapshot;
    }).not.toThrow();
    expect(snap?.totals.turns).toBe(1); // last-known seeded total survives; scan failure swallowed
    expect(snap?.totals.inputTokens).toBe(1_000_000);
    expect(snap?.progress.done).toBe(true); // a failed step reports done so the view stops polling
    expect(snap?.hasAnyTurns).toBe(true); // the seeded turn survives the swallowed scan failure
  });

  it("returns zeroed totals when no analytics db is wired in", () => {
    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider });
    expect(handlers.get(IPC.readStats)!()).toEqual({
      totals: {
        sessions: 0,
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        equivApiValueUsd: 0,
      },
      progress: { filesTotal: 0, filesDone: 0, done: true },
      hasAnyTurns: false,
    });
  });

  it("scopes the returned totals to the requested range", () => {
    const home = makeHome();
    mkdirSync(join(home, "projects"), { recursive: true }); // empty: the scan finds nothing, seeds survive

    const now = Date.now();
    const DAY = 86_400_000;
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    const seed = (id: string, ts: number) => ({
      messageId: id,
      sessionId: id,
      ts,
      modelRaw: "claude-opus-4-8",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      cwd: "/w",
      project: "w",
    });
    upsertTurns(analyticsDb, [
      seed("recent", now - 60 * 60_000), // an hour ago: inside every windowed range
      seed("mid", now - 10 * DAY), // ten days ago: inside 90d, outside 7d
      seed("old", now - 100 * DAY), // a hundred days ago: only all-time
    ]);

    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider, analyticsDb, claudeDir: home });

    const turnsFor = (range?: StatsRange): number =>
      (handlers.get(IPC.readStats)!(null, range) as StatsSnapshot).totals.turns;

    expect(turnsFor("all")).toBe(3);
    expect(turnsFor("90d")).toBe(2);
    expect(turnsFor("7d")).toBe(1);
    expect(turnsFor()).toBe(3); // a missing range falls back to all-time, not the product 30d default
  });

  it("with a store but no claude dir, serves last-known totals and reports done", () => {
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    upsertTurns(analyticsDb, [
      {
        messageId: "seed",
        sessionId: "s",
        ts: 0,
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
        cwd: "/w",
        project: "w",
      },
    ]);

    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider, analyticsDb }); // no claudeDir → no scan, just the last-known totals

    const snap = handlers.get(IPC.readStats)!() as StatsSnapshot;
    expect(snap.totals.turns).toBe(1);
    expect(snap.totals.inputTokens).toBe(1_000_000);
    expect(snap.progress.done).toBe(true);
    expect(snap.hasAnyTurns).toBe(true); // the seeded turn is present
  });
});
