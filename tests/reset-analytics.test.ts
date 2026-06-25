import { describe, it, expect, vi } from "vitest";
import { IPC, type StatsRead } from "@shared/ipc";
import type { Provider } from "../src/main/provider/types";
import type { SqliteDb } from "../src/main/db/driver";
import {
  migrateAnalytics,
  upsertTurns,
  hasAnyTurns,
  readProcessedFiles,
  upsertProcessedFile,
  type AnalyticsTurn,
} from "../src/main/db/analytics";
import { openTestDb } from "./helpers/sqlite";

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

const provider = {
  id: "fake",
  capabilities: {
    canControl: false,
    hasRateLimits: false,
    hasSubagents: false,
  },
  listCandidates: () => [],
  summarize: () => {
    throw new Error("unused");
  },
  restate: (_c: unknown, prev: unknown) => prev,
  readTranscript: () => ({ status: "absent" }),
  readSubagentTranscript: () => ({ status: "absent" }),
  readTasks: () => ({ status: "absent" }),
  readShells: () => ({ status: "absent" }),
  readShellOutput: () => ({ status: "absent" }),
  readMetrics: () => ({ status: "absent" }),
  resolveAdoptTarget: () => null,
} as unknown as Provider;

const turn = (over: Partial<AnalyticsTurn> = {}): AnalyticsTurn => ({
  messageId: "msg-1",
  sessionId: "sess-1",
  ts: 1000,
  modelRaw: "claude-opus-4-8",
  usage: {
    inputTokens: 1,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  },
  cwd: "/work/proj",
  project: "proj",
  branch: "main",
  ...over,
});

// Local noon mid-year, so the year readCalendarYears derives never straddles a timezone boundary.
const tsInYear = (year: number): number => new Date(year, 5, 15, 12).getTime();

describe("registerIpc analytics:reset", () => {
  it("clears turns and high-water marks, returning ok", () => {
    const db = openTestDb();
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    upsertTurns(analyticsDb, [turn()]);
    upsertProcessedFile(analyticsDb, "/a.jsonl", 1, 1);

    registerIpc({ db, provider, analyticsDb });
    const res = handlers.get(IPC.resetAnalytics)!(null) as { ok: boolean };

    expect(res.ok).toBe(true);
    expect(hasAnyTurns(analyticsDb)).toBe(false);
    expect(readProcessedFiles(analyticsDb).size).toBe(0);
  });

  it("returns ok:false when no analytics store is wired", () => {
    const db = openTestDb();
    registerIpc({ db, provider }); // analyticsDb omitted
    const res = handlers.get(IPC.resetAnalytics)!(null) as { ok: boolean };
    expect(res.ok).toBe(false);
  });

  it("returns ok:false when the clear throws", () => {
    const db = openTestDb();
    // A store whose every exec fails: clearAnalytics's transaction throws on BEGIN, which the handler must
    // catch and report as ok:false rather than letting the rejection escape to the renderer.
    const throwingDb = {
      exec: () => {
        throw new Error("simulated clear failure");
      },
    } as unknown as SqliteDb;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    registerIpc({ db, provider, analyticsDb: throwingDb });
    const res = handlers.get(IPC.resetAnalytics)!(null) as { ok: boolean };

    expect(res.ok).toBe(false);
    errSpy.mockRestore();
  });

  it("recomputes calendar years after a reset that reuses rowids", () => {
    const db = openTestDb();
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    upsertTurns(analyticsDb, [
      turn({ messageId: "y2020", ts: tsInYear(2020) }),
    ]);

    registerIpc({ db, provider, analyticsDb });
    const readStats = handlers.get(IPC.readStats)!;

    // First read memoizes the year list against the max turns rowid (1 here).
    const before = readStats(
      null,
      undefined,
      undefined,
      undefined,
    ) as StatsRead;
    if (before.status !== "changed") throw new Error("expected a snapshot");
    expect(before.snapshot.calendarYears).toEqual([2020]);

    // Reset empties turns; the re-ingest below reuses rowid 1, so the year cache's max-rowid key collides
    // with the pre-reset value. Unless the reset dropped the cache, the stale [2020] list is served.
    expect(
      (handlers.get(IPC.resetAnalytics)!(null) as { ok: boolean }).ok,
    ).toBe(true);
    upsertTurns(analyticsDb, [
      turn({ messageId: "y2021", ts: tsInYear(2021) }),
    ]);

    const after = readStats(null, undefined, undefined, undefined) as StatsRead;
    if (after.status !== "changed") throw new Error("expected a snapshot");
    expect(after.snapshot.calendarYears).toEqual([2021]);
  });
});
