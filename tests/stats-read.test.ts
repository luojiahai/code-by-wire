import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { IPC } from "@shared/ipc";
import type { StatsRead } from "@shared/ipc";
import type { StatsSnapshot, StatsRange, StatsByModel } from "@shared/stats";
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
    createdMs: 0,
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
  readSubagentTranscript: () => ({ status: "absent" }),
  readTasks: () => ({ status: "absent" }),
  readMetrics: () => ({ status: "absent" }),
  resolveAdoptTarget: () => null,
};

describe("registerIpc stats:read", () => {
  // Unwrap a `changed` poll to its snapshot for the assertions below; the unchanged path has its own test.
  const readChanged = (
    range?: StatsRange,
    calendarYear?: number,
  ): StatsSnapshot => {
    const r = handlers.get(IPC.readStats)!(
      null,
      range,
      calendarYear,
    ) as StatsRead;
    if (r.status !== "changed")
      throw new Error(`expected changed, got ${r.status}`);
    return r.snapshot;
  };

  it("an unchanged poll returns {status:'unchanged'} and skips building a snapshot", () => {
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

    const first = handlers.get(IPC.readStats)!() as StatsRead;
    expect(first.status).toBe("changed");
    if (first.status !== "changed") throw new Error("expected changed");
    expect(first.snapshot.totals.turns).toBe(1);

    const second = handlers.get(IPC.readStats)!(
      null,
      undefined,
      undefined,
      first.token,
    ) as StatsRead;
    expect(second.status).toBe("unchanged");
    expect(second.token).toBe(first.token);
    expect("snapshot" in second).toBe(false);
  });

  it("a non-matching `since` token returns a fresh snapshot", () => {
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
            input_tokens: 5,
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

    const r = handlers.get(IPC.readStats)!(
      null,
      undefined,
      undefined,
      "stale:token:0/0",
    ) as StatsRead;
    expect(r.status).toBe("changed");
  });

  it("ingests a transcript that appears after a cached walk, and re-renders on a turn-less progress move", () => {
    // Regression: the change token must fold in scan progress, and `done` must not settle off a stale
    // cached walk. A new turn-LESS transcript appears within the walk-cache TTL after the first poll: the
    // cached walk can't see it, only the fresh re-walk on `done` does. Its arrival moves progress
    // (filesTotal 1->2) without ingesting a turn — so the token must move and the poll must report changed.
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
            input_tokens: 5,
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

    const first = handlers.get(IPC.readStats)!() as StatsRead;
    if (first.status !== "changed") throw new Error("expected changed");
    expect(first.snapshot.totals.turns).toBe(1);
    expect(first.snapshot.progress.filesTotal).toBe(1);

    // A turn-less transcript (a user line, no assistant usage) lands after the walk was cached.
    writeFileSync(
      join(dir, "sess-2.jsonl"),
      JSON.stringify({
        type: "user",
        cwd: "/work/proj",
        message: { role: "user", content: "hi" },
      }) + "\n",
    );

    const second = handlers.get(IPC.readStats)!(
      null,
      undefined,
      undefined,
      first.token,
    ) as StatsRead;
    expect(second.status).toBe("changed");
    if (second.status !== "changed") throw new Error("expected changed");
    expect(second.snapshot.totals.turns).toBe(1); // the new file carried no turn
    expect(second.snapshot.progress.filesTotal).toBe(2); // but it was discovered and counted
  });

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

    const snap = readChanged();
    expect(snap.totals.sessions).toBe(1);
    expect(snap.totals.turns).toBe(1);
    expect(snap.totals.inputTokens).toBe(1_000_000);
    expect(snap.totals.equivApiValueUsd).toBeCloseTo(5); // opus $5/M input
    expect(snap.progress.done).toBe(true);
    expect(snap.hasAnyTurns).toBe(true); // a turn was ingested

    // A second call is a no-op: the file is unchanged, so totals hold and it's still done.
    const again = readChanged();
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
      snap = readChanged();
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
    const r = handlers.get(IPC.readStats)!() as StatsRead;
    expect(r.status).toBe("changed");
    if (r.status !== "changed") throw new Error("expected changed");
    expect(typeof r.token).toBe("string");
    expect(r.snapshot).toEqual({
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
      byModel: [],
      byProject: [],
      byBranch: [],
      bySession: [],
      daily: [],
      calendar: [],
      calendarStart: "",
      calendarEnd: "",
      calendarYears: [],
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
      readChanged(range).totals.turns;

    expect(turnsFor("all")).toBe(3);
    expect(turnsFor("90d")).toBe(2);
    expect(turnsFor("7d")).toBe(1);
    expect(turnsFor()).toBe(3); // a missing range falls back to all-time, not the product 30d default
  });

  it("returns a per-model breakdown scoped to the requested range", () => {
    const home = makeHome();
    mkdirSync(join(home, "projects"), { recursive: true }); // empty: the seeds survive the scan

    const now = Date.now();
    const DAY = 86_400_000;
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    upsertTurns(analyticsDb, [
      // in 7d: opus, 1M input → $5.
      {
        messageId: "recent",
        sessionId: "s1",
        ts: now - 60 * 60_000,
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
      // outside 7d: sonnet, 100 days ago → only all-time sees it.
      {
        messageId: "old",
        sessionId: "s2",
        ts: now - 100 * DAY,
        modelRaw: "claude-sonnet-4-6",
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

    const byModelFor = (range?: StatsRange): StatsByModel[] =>
      readChanged(range).byModel;

    const all = byModelFor("all");
    expect(all.map((r) => r.modelRaw).sort()).toEqual([
      "claude-opus-4-8",
      "claude-sonnet-4-6",
    ]);

    const week = byModelFor("7d");
    expect(week).toHaveLength(1); // the 100-day-old sonnet is out of the window
    expect(week[0].modelRaw).toBe("claude-opus-4-8");
    expect(week[0].equivApiValueUsd).toBeCloseTo(5);
  });

  it("returns per-project and per-branch breakdowns scoped to the requested range", () => {
    const home = makeHome();
    mkdirSync(join(home, "projects"), { recursive: true }); // empty: the seeds survive the scan

    const now = Date.now();
    const DAY = 86_400_000;
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    upsertTurns(analyticsDb, [
      // in 7d: project "alpha" on main, opus 1M input → $5.
      {
        messageId: "recent",
        sessionId: "s1",
        ts: now - 60 * 60_000,
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
        cwd: "/w/alpha",
        project: "alpha",
        branch: "main",
      },
      // outside 7d: project "beta" on dev, 100 days ago → only all-time sees it.
      {
        messageId: "old",
        sessionId: "s2",
        ts: now - 100 * DAY,
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
        cwd: "/w/beta",
        project: "beta",
        branch: "dev",
      },
    ]);

    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider, analyticsDb, claudeDir: home });

    const snapFor = (range?: StatsRange): StatsSnapshot => readChanged(range);

    const all = snapFor("all");
    expect(all.byProject.map((r) => r.project).sort()).toEqual([
      "alpha",
      "beta",
    ]);
    expect(all.byBranch.map((r) => r.branch).sort()).toEqual(["dev", "main"]);

    const week = snapFor("7d");
    expect(week.byProject).toHaveLength(1); // beta is 100 days old, out of the window
    expect(week.byProject[0].project).toBe("alpha");
    expect(week.byProject[0].equivApiValueUsd).toBeCloseTo(5);
    expect(week.byBranch).toHaveLength(1);
    expect(week.byBranch[0].branch).toBe("main");
  });

  it("returns a per-session breakdown scoped to the requested range", () => {
    const home = makeHome();
    mkdirSync(join(home, "projects"), { recursive: true }); // empty: the seeds survive the scan

    const now = Date.now();
    const DAY = 86_400_000;
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    upsertTurns(analyticsDb, [
      // in 7d: session "recent", opus 1M input → $5.
      {
        messageId: "recent",
        sessionId: "recent",
        ts: now - 60 * 60_000,
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
        cwd: "/w/alpha",
        project: "alpha",
      },
      // outside 7d: session "old", 100 days ago → only all-time sees it.
      {
        messageId: "old",
        sessionId: "old",
        ts: now - 100 * DAY,
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
        cwd: "/w/beta",
        project: "beta",
      },
    ]);

    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider, analyticsDb, claudeDir: home });

    const snapFor = (range?: StatsRange): StatsSnapshot => readChanged(range);

    const all = snapFor("all");
    expect(all.bySession.map((r) => r.sessionId).sort()).toEqual([
      "old",
      "recent",
    ]);

    const week = snapFor("7d");
    expect(week.bySession).toHaveLength(1); // the 100-day-old session is out of the window
    expect(week.bySession[0].sessionId).toBe("recent");
    expect(week.bySession[0].equivApiValueUsd).toBeCloseTo(5);
  });

  it("returns a daily time-series in the snapshot, ascending by day", () => {
    const home = makeHome();
    mkdirSync(join(home, "projects"), { recursive: true });

    const noon = (y: number, m: number, d: number): number =>
      new Date(y, m - 1, d, 12, 0, 0).getTime();
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    upsertTurns(analyticsDb, [
      {
        messageId: "recent",
        sessionId: "s1",
        ts: noon(2026, 6, 14),
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
      {
        messageId: "old",
        sessionId: "s2",
        ts: noon(2026, 1, 1),
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 500_000,
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

    const all = readChanged("all").daily;
    expect(all.map((d) => d.day)).toEqual(["2026-01-01", "2026-06-14"]);
    expect(all[1].inputTokens).toBe(1_000_000);
    expect(all[1].byModel).toEqual([
      { modelRaw: "claude-opus-4-8", totalTokens: 1_000_000 },
    ]);
  });

  it("returns the calendar window scoped to the requested year, with the years list", () => {
    const home = makeHome();
    mkdirSync(join(home, "projects"), { recursive: true });
    const noon = (y: number, m: number, d: number): number =>
      new Date(y, m - 1, d, 12, 0, 0).getTime();

    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    upsertTurns(analyticsDb, [
      {
        messageId: "y24",
        sessionId: "s",
        ts: noon(2024, 3, 2),
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
      {
        messageId: "y26",
        sessionId: "s",
        ts: noon(2026, 6, 14),
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

    // calendarYear = 2024 → only the 2024 turn lands in the calendar window.
    const snap = readChanged(undefined, 2024);
    expect(snap.calendarStart).toBe("2024-01-01");
    expect(snap.calendarEnd).toBe("2024-12-31");
    expect(snap.calendar.map((d) => d.day)).toEqual(["2024-03-02"]);
    expect(snap.calendar[0].turns).toBe(1);
    expect(snap.calendarYears).toEqual([2026, 2024]);
  });

  it("scopes the page totals to a single clicked day (the {day} range)", () => {
    const home = makeHome();
    mkdirSync(join(home, "projects"), { recursive: true });
    const noon = (y: number, m: number, d: number): number =>
      new Date(y, m - 1, d, 12, 0, 0).getTime();

    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    const seed = (id: string, ts: number, input: number) => ({
      messageId: id,
      sessionId: id,
      ts,
      modelRaw: "claude-opus-4-8",
      usage: {
        inputTokens: input,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      cwd: "/w",
      project: "w",
    });
    upsertTurns(analyticsDb, [
      seed("d14", noon(2026, 6, 14), 5),
      seed("d15", noon(2026, 6, 15), 99),
    ]);

    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider, analyticsDb, claudeDir: home });

    const snap = readChanged({ day: "2026-06-14" });
    expect(snap.totals.turns).toBe(1);
    expect(snap.totals.inputTokens).toBe(5);
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

    const snap = readChanged();
    expect(snap.totals.turns).toBe(1);
    expect(snap.totals.inputTokens).toBe(1_000_000);
    expect(snap.progress.done).toBe(true);
    expect(snap.hasAnyTurns).toBe(true); // the seeded turn is present
  });
});
