import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IPC } from "@shared/ipc";
import type { ScanProgress } from "@shared/stats";
import type { Provider } from "../src/main/provider/types";
import type { SqliteDb } from "../src/main/db/driver";

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
import { migrateAnalytics, hasAnyTurns } from "../src/main/db/analytics";
import { openTestDb } from "./helpers/sqlite";
import { tempHomes } from "./helpers/temp-home";

const makeHome = tempHomes("cbw-stats-pump-");

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

const pump = (): ScanProgress =>
  handlers.get(IPC.pumpStats)!(null) as ScanProgress;

describe("registerIpc stats:pump", () => {
  it("serves a done progress when no analytics store is wired", () => {
    registerIpc({ db: openTestDb(), provider });
    expect(pump()).toEqual({ filesTotal: 0, filesDone: 0, done: true });
  });

  it("serves a done progress when no claude dir is wired", () => {
    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    registerIpc({ db: openTestDb(), provider, analyticsDb });
    expect(pump()).toEqual({ filesTotal: 0, filesDone: 0, done: true });
  });

  it("ingests transcripts without any stats:read poll", () => {
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
            input_tokens: 1_000,
            output_tokens: 5,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }) + "\n",
    );

    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    registerIpc({ db: openTestDb(), provider, analyticsDb, claudeDir: home });

    // Drive the pump alone (never stats:read). Bounded loop in case a regression stops `done`.
    let progress = pump();
    for (let i = 0; i < 10 && !progress.done; i++) progress = pump();

    expect(progress.done).toBe(true);
    expect(progress.filesTotal).toBe(1);
    expect(hasAnyTurns(analyticsDb)).toBe(true);
  });

  it("absorbs a scan failure into a done progress instead of rejecting", () => {
    const home = makeHome();
    mkdirSync(join(home, "projects"), { recursive: true });
    // Every prepare/exec throws: readProcessedFiles inside scanStep blows up, which runScanStep must
    // catch and turn into a done progress so the pump idles rather than spins or rejects.
    const throwingDb = {
      prepare: () => {
        throw new Error("simulated scan failure");
      },
      exec: () => {
        throw new Error("simulated scan failure");
      },
    } as unknown as SqliteDb;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    registerIpc({
      db: openTestDb(),
      provider,
      analyticsDb: throwingDb,
      claudeDir: home,
    });

    expect(pump()).toEqual({ filesTotal: 0, filesDone: 0, done: true });
    errSpy.mockRestore();
  });
});
