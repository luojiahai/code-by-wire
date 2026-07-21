import { describe, it, expect, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { IPC, type DbInfo } from "@shared/ipc";
import type { Provider } from "../src/main/provider/types";

const { handlers, showItemInFolder } = vi.hoisted(() => ({
  handlers: new Map<string, (...a: unknown[]) => unknown>(),
  showItemInFolder: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: (...a: unknown[]) => unknown) =>
      handlers.set(channel, fn),
  },
  shell: { showItemInFolder },
}));

import { registerIpc } from "../src/main/ipc";
import {
  migrateAnalytics,
  upsertTurns,
  type AnalyticsTurn,
} from "../src/main/db/analytics";
import { openTestDb } from "./helpers/sqlite";
import { migrate } from "../src/main/db/store";
import { tempHomes } from "./helpers/temp-home";

const makeHome = tempHomes("cbw-stats-dbinfo-");

const provider = {
  id: "fake",
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
  resolveResumeTarget: () => null,
} as unknown as Provider;

const turn = (over: Partial<AnalyticsTurn> = {}): AnalyticsTurn => ({
  messageId: "msg-1",
  sessionId: "sess-1",
  agent: "claude",
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

const dbInfo = (): DbInfo | null =>
  handlers.get(IPC.dbInfo)!(null) as DbInfo | null;

describe("registerIpc db:info", () => {
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
    const analyticsPath = join(home, "analytics.db");
    const indexPath = join(home, "index.db");
    // The handler stats the path independently of the (in-memory) test store, so any file works.
    writeFileSync(analyticsPath, "x".repeat(2048));
    writeFileSync(indexPath, "x".repeat(1024));

    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    upsertTurns(analyticsDb, [
      turn({ messageId: "a", sessionId: "s1", ts: 5000 }),
      turn({
        messageId: "b",
        sessionId: "s2",
        agent: "codex",
        ts: 2000,
      }),
    ]);
    const indexDb = openTestDb();
    migrate(indexDb);
    indexDb.exec(`
      INSERT INTO sessions (id, title, project, state, management, agent, model, last_activity_ms)
      VALUES ('c1', 'Claude', 'p', 'idle', 'observed', 'claude', 'opus', 1),
             ('x1', 'Codex', 'p', 'idle', 'observed', 'codex', 'opus', 1)
    `);

    registerIpc({
      db: indexDb,
      provider,
      analyticsDb,
      analyticsDbPath: analyticsPath,
      indexDbPath: indexPath,
    });

    expect(dbInfo()).toEqual({
      analytics: {
        path: analyticsPath,
        sizeBytes: 2048,
        turns: { total: 2, byAgent: { claude: 1, codex: 1 } },
        sessions: { total: 2, byAgent: { claude: 1, codex: 1 } },
        oldestTs: 2000,
        processedFiles: 0,
        worktrees: 0,
      },
      index: {
        path: indexPath,
        sizeBytes: 1024,
        sessions: { total: 2, byAgent: { claude: 1, codex: 1 } },
      },
    });
  });

  it("serves zero counts and a null oldestTs for an empty store", () => {
    const home = makeHome();
    const analyticsPath = join(home, "analytics.db");
    const indexPath = join(home, "index.db");
    writeFileSync(analyticsPath, "");
    writeFileSync(indexPath, "");
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    const indexDb = openTestDb();
    migrate(indexDb);

    registerIpc({
      db: indexDb,
      provider,
      analyticsDb,
      analyticsDbPath: analyticsPath,
      indexDbPath: indexPath,
    });

    expect(dbInfo()).toEqual({
      analytics: {
        path: analyticsPath,
        sizeBytes: 0,
        turns: { total: 0, byAgent: { claude: 0, codex: 0 } },
        sessions: { total: 0, byAgent: { claude: 0, codex: 0 } },
        oldestTs: null,
        processedFiles: 0,
        worktrees: 0,
      },
      index: {
        path: indexPath,
        sizeBytes: 0,
        sessions: { total: 0, byAgent: { claude: 0, codex: 0 } },
      },
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
      indexDbPath: join(home, "also-missing.db"),
    });

    expect(dbInfo()).toBeNull();
    errSpy.mockRestore();
  });

  it("reveals only the configured database paths", () => {
    const home = makeHome();
    const analyticsDbPath = join(home, "analytics.db");
    const indexDbPath = join(home, "index.db");
    registerIpc({
      db: openTestDb(),
      provider,
      analyticsDbPath,
      indexDbPath,
    });
    const reveal = handlers.get(IPC.revealPath)!;
    showItemInFolder.mockClear();
    reveal(null, analyticsDbPath);
    reveal(null, indexDbPath);
    reveal(null, join(home, "other.db"));
    reveal(null, 42);
    expect(showItemInFolder.mock.calls).toEqual([
      [analyticsDbPath],
      [indexDbPath],
    ]);
  });
});
