import { describe, it, expect, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { IPC, type StatsDbInfo } from "@shared/ipc";
import type { Provider } from "../src/main/provider/types";

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
import {
  migrateAnalytics,
  upsertTurns,
  type AnalyticsTurn,
} from "../src/main/db/analytics";
import { openTestDb } from "./helpers/sqlite";
import { tempHomes } from "./helpers/temp-home";

const makeHome = tempHomes("cbw-stats-dbinfo-");

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

const dbInfo = (): StatsDbInfo | null =>
  handlers.get(IPC.statsDbInfo)!(null) as StatsDbInfo | null;

describe("registerIpc stats:dbinfo", () => {
  it("resolves null when no analytics store is wired", () => {
    registerIpc({ db: openTestDb(), provider });
    expect(dbInfo()).toBeNull();
  });

  it("resolves null when the store is wired without a path", () => {
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    registerIpc({ db: openTestDb(), provider, analyticsDb });
    expect(dbInfo()).toBeNull();
  });

  it("serves path, on-disk size, counts, and the oldest ts", () => {
    const home = makeHome();
    const dbPath = join(home, "analytics.db");
    // The handler stats the path independently of the (in-memory) test store, so any file works.
    writeFileSync(dbPath, "x".repeat(2048));

    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    upsertTurns(analyticsDb, [
      turn({ messageId: "a", sessionId: "s1", ts: 5000 }),
      turn({ messageId: "b", sessionId: "s2", ts: 2000 }),
    ]);

    registerIpc({
      db: openTestDb(),
      provider,
      analyticsDb,
      analyticsDbPath: dbPath,
    });

    expect(dbInfo()).toEqual({
      path: dbPath,
      sizeBytes: 2048,
      turns: 2,
      sessions: 2,
      oldestTs: 2000,
    });
  });

  it("serves zero counts and a null oldestTs for an empty store", () => {
    const home = makeHome();
    const dbPath = join(home, "analytics.db");
    writeFileSync(dbPath, "");
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);

    registerIpc({
      db: openTestDb(),
      provider,
      analyticsDb,
      analyticsDbPath: dbPath,
    });

    expect(dbInfo()).toEqual({
      path: dbPath,
      sizeBytes: 0,
      turns: 0,
      sessions: 0,
      oldestTs: null,
    });
  });

  it("resolves null (never rejects) when the stat fails", () => {
    const home = makeHome();
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    registerIpc({
      db: openTestDb(),
      provider,
      analyticsDb,
      analyticsDbPath: join(home, "does-not-exist.db"),
    });

    expect(dbInfo()).toBeNull();
    errSpy.mockRestore();
  });
});
