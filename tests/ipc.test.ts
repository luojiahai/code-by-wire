import { describe, it, expect, vi } from "vitest";
import type { PersistedSession } from "@shared/types";
import { IPC, type OverviewData } from "@shared/ipc";
import type { Provider } from "../src/main/provider/types";
import type { StatusLineReader, StatusLineSample } from "@shared/statusline";

// Capture the handlers registerIpc registers, without a real Electron ipcMain.
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
import { migrate, upsertSessions } from "../src/main/db/store";
import { openTestDb } from "./helpers/sqlite";

const seed: PersistedSession = {
  id: "seed",
  title: "Seeded",
  project: "p",
  branch: undefined,
  state: "idle",
  management: "observed",
  model: "opus",
  lastActivityMs: 1,
  createdMs: 0,
  awaitingUser: false,
  transcriptMtimeMs: 0,
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  },
  contextTokens: 0,
};

const provider = (listCandidates: Provider["listCandidates"]): Provider => ({
  id: "fake",
  capabilities: {
    canControl: false,
    hasRateLimits: false,
    hasSubagents: false,
  },
  listCandidates,
  summarize: (c) => ({ ...seed, id: c.id }),
  restate: (_c, prev) => prev,
  readTranscript: () => ({ status: "absent" }),
  readSubagentTranscript: () => ({ status: "absent" }),
  readTasks: () => ({ status: "absent" }),
  readShells: () => ({ status: "absent" }),
  readShellOutput: () => ({ status: "absent" }),
  readMetrics: () => ({ status: "absent" }),
  resolveAdoptTarget: () => null,
  resolveSessionCwd: () => null,
  getToolResult: () => ({ found: false }),
});

describe("registerIpc refresh", () => {
  it("serves the last-known rows when a sync throws, instead of rejecting to the renderer", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => {
        throw new Error("EACCES: ~/.claude unreadable");
      }),
    });

    const refresh = handlers.get(IPC.refresh)!;
    let result: OverviewData | undefined;
    expect(() => {
      result = refresh() as OverviewData;
    }).not.toThrow();
    expect(result?.sessions.map((s) => s.id)).toEqual(["seed"]);
  });
});

describe("registerIpc readTranscript", () => {
  it("delegates to the provider (absent when no transcript)", () => {
    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider: provider(() => []) });
    const handler = handlers.get(IPC.readTranscript)!;
    expect(handler({}, "any-id")).toEqual({ status: "absent" });
  });
});

describe("registerIpc overview", () => {
  it("returns the seeded sessions from one read", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]); // opus, project 'p', zero usage
    registerIpc({ db, provider: provider(() => []) });

    const handler = handlers.get(IPC.overview)!;
    const o = handler() as OverviewData;
    expect(o.sessions.map((s) => s.id)).toEqual(["seed"]);
  });
});

const lineSample = (
  over: Partial<StatusLineSample> = {},
): StatusLineSample => ({
  sessionId: "seed",
  capturedMtimeMs: Date.now(),
  costUsd: null,
  linesAdded: null,
  linesRemoved: null,
  contextPct: null,
  contextWindow: null,
  liveContext: null,
  modelId: null,
  modelDisplayName: null,
  sessionName: null,
  version: null,
  effortLevel: null,
  cwd: null,
  sessionClockMs: null,
  rateLimits: null,
  ...over,
});

const reader = (samples: StatusLineSample[]): StatusLineReader => ({
  read: () => samples,
});

describe("registerIpc overview — statusLine overlay", () => {
  it("overlays live cost/context onto the matching session and derives a subscription account", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]); // id 'seed', opus, zero computed usage → equivApiValueUsd 0
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([
        lineSample({
          sessionId: "seed",
          costUsd: 1.25,
          linesAdded: 10,
          linesRemoved: 2,
          contextPct: 47,
          rateLimits: {
            fiveHour: { usedPct: 20, resetsAt: Date.now() + 3_600_000 },
          },
        }),
      ]),
    });

    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account).toEqual({
      billingMode: "subscription",
      fiveHour: { usedPct: 20, resetsAt: expect.any(Number) },
      sevenDay: undefined,
    });
    const s = o.sessions.find((x) => x.id === "seed")!;
    expect(s.liveCostUsd).toBe(1.25);
    expect(s.linesAdded).toBe(10);
    expect(s.contextPct).toBe(47);
  });

  it("serves account null and untouched computed values when there is no statusLine data (AC #4)", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({ db, provider: provider(() => []), statusLine: reader([]) });

    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account).toBeNull();
    const s = o.sessions.find((x) => x.id === "seed")!;
    expect(s.liveCostUsd).toBeUndefined();
    expect(s.equivApiValueUsd).toBe(0); // computed, still present
  });

  it("defaults to no live data when no statusLine reader is provided", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({ db, provider: provider(() => []) }); // no statusLine dep

    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account).toBeNull();
  });
});

describe("registerIpc overview — account email", () => {
  it("attaches the email to the account when accountEmail dep is provided", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([
        lineSample({
          sessionId: "seed",
          rateLimits: {
            fiveHour: { usedPct: 20, resetsAt: Date.now() + 3_600_000 },
          },
        }),
      ]),
      accountEmail: () => "me@example.com",
    });

    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account?.email).toBe("me@example.com");
  });

  it("leaves account.email undefined when no accountEmail dep is provided", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([
        lineSample({
          sessionId: "seed",
          rateLimits: {
            fiveHour: { usedPct: 20, resetsAt: Date.now() + 3_600_000 },
          },
        }),
      ]),
      // no accountEmail dep
    });

    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account).not.toBeNull(); // subscription account exists
    expect(o.account?.email).toBeUndefined();
  });
});

describe("registerIpc overview — api billing", () => {
  it("promotes an unknown account to api and attaches the config when apiConfig is provided", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([lineSample({ sessionId: "seed" })]), // no rateLimits → deriveAccount returns 'unknown'
      apiConfig: () => ({
        baseUrl: "https://api.portkey.ai",
        authMethod: "token",
        provider: "bedrock-use1-nonprod",
      }),
    });
    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account).toEqual({
      billingMode: "api",
      apiBaseUrl: "https://api.portkey.ai",
      apiAuthMethod: "token",
      apiProvider: "bedrock-use1-nonprod",
    });
  });

  it("keeps a subscription account in subscription mode even when apiConfig is present (subscription wins)", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([
        lineSample({
          sessionId: "seed",
          rateLimits: {
            fiveHour: { usedPct: 20, resetsAt: Date.now() + 3_600_000 },
          },
        }),
      ]),
      apiConfig: () => ({ baseUrl: "https://api.portkey.ai" }),
    });
    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account?.billingMode).toBe("subscription");
    expect(o.account?.apiBaseUrl).toBeUndefined();
  });

  it("does not relabel a dormant subscription (all windows expired) as api even when apiConfig is present", () => {
    // Regression: a real subscription gone idle still writes captures carrying rate_limits whose windows
    // have reset. deriveAccount returns 'unknown', but the rate_limits history proves the account is a
    // subscriber, not API billing. Promoting it to 'api' just because a base URL is configured would flip
    // every session's cost label from '~equivalent value' to 'Actual API spend'.
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([
        lineSample({
          sessionId: "seed",
          rateLimits: {
            fiveHour: { usedPct: 80, resetsAt: Date.now() - 1 },
            sevenDay: { usedPct: 40, resetsAt: Date.now() - 1 },
          },
        }),
      ]),
      apiConfig: () => ({ baseUrl: "https://api.portkey.ai" }),
    });
    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account?.billingMode).toBe("unknown");
    expect(o.account?.apiBaseUrl).toBeUndefined();
  });

  it("leaves an unknown account untouched when apiConfig returns null (no base URL configured)", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([lineSample({ sessionId: "seed" })]),
      apiConfig: () => null,
    });
    expect((handlers.get(IPC.overview)!() as OverviewData).account).toEqual({
      billingMode: "unknown",
    });
  });

  it("does not promote when no apiConfig dep is provided", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([lineSample({ sessionId: "seed" })]),
    });
    expect((handlers.get(IPC.overview)!() as OverviewData).account).toEqual({
      billingMode: "unknown",
    });
  });
});

describe("registerIpc renameSession", () => {
  // A tiny in-memory stand-in for the durable store, with the same trim/clear semantics.
  const fakeStore = (titles: Record<string, string>) => ({
    read: () => titles,
    set: (id: string, title: string | null) => {
      const trimmed = title?.trim();
      if (trimmed) titles[id] = trimmed;
      else delete titles[id];
    },
  });

  it("persists the override via the store and applies it to the overview", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]); // title 'Seeded'
    const titles: Record<string, string> = {};
    registerIpc({
      db,
      provider: provider(() => []),
      sessionTitles: fakeStore(titles),
    });

    const o = handlers.get(IPC.renameSession)!(
      {},
      "seed",
      "  My Name  ",
    ) as OverviewData;
    expect(titles).toEqual({ seed: "My Name" });
    expect(o.sessions.find((s) => s.id === "seed")!.title).toBe("My Name");
  });

  it("a rename wins over Claude's live session_name", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([
        lineSample({ sessionId: "seed", sessionName: "ClaudeName" }),
      ]),
      sessionTitles: fakeStore({ seed: "MyName" }),
    });
    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.sessions.find((s) => s.id === "seed")!.title).toBe("MyName");
  });

  it("clears the override on an empty title, reverting to the derived title", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]); // title 'Seeded'
    const titles: Record<string, string> = { seed: "MyName" };
    registerIpc({
      db,
      provider: provider(() => []),
      sessionTitles: fakeStore(titles),
    });
    const o = handlers.get(IPC.renameSession)!({}, "seed", "") as OverviewData;
    expect(titles).toEqual({});
    expect(o.sessions.find((s) => s.id === "seed")!.title).toBe("Seeded");
  });

  it("applies no overrides when no sessionTitles dep is provided", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({ db, provider: provider(() => []) });
    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.sessions.find((s) => s.id === "seed")!.title).toBe("Seeded");
  });
});
