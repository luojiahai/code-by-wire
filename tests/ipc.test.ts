import { describe, it, expect, vi } from "vitest";
import { homedir, tmpdir } from "node:os";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PersistedSession } from "@shared/types";
import { IPC, type OverviewData } from "@shared/ipc";
import type { Provider } from "../src/main/provider/types";
import type { StatusLineReader, StatusLineSample } from "@shared/statusline";
import { createCaffeinate } from "../src/main/caffeinate";
import { createAppSettingsStore } from "../src/main/app-settings";

// Capture the handlers registerIpc registers, without a real Electron ipcMain.
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...a: unknown[]) => unknown>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: (...a: unknown[]) => unknown) =>
      handlers.set(channel, fn),
  },
  nativeTheme: { themeSource: "system" },
}));

import { registerIpc } from "../src/main/ipc";
import { migrate, upsertSessions } from "../src/main/db/store";
import { migrateAnalytics, upsertWorktree } from "../src/main/db/analytics";
import { openTestDb } from "./helpers/sqlite";

const seed: PersistedSession = {
  id: "seed",
  title: "Seeded",
  project: "p",
  cwd: "/w/p",
  branch: undefined,
  state: "idle",
  management: "observed",
  agent: "claude",
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
  listCandidates,
  summarize: (c) => ({ ...seed, id: c.id }),
  restate: (_c, prev) => prev,
  readTranscript: () => ({ status: "absent" }),
  readSubagentTranscript: () => ({ status: "absent" }),
  readTasks: () => ({ status: "absent" }),
  readShells: () => ({ status: "absent" }),
  readShellOutput: () => ({ status: "absent" }),
  readMonitors: () => ({ status: "absent" }),
  readMonitorOutput: () => ({ status: "absent" }),
  readMetrics: () => ({ status: "absent" }),
  resolveResumeTarget: () => null,
  resolveSessionCwd: () => null,
  getToolResult: () => ({ found: false }),
});

describe("registerIpc refresh", () => {
  it("awaits async pre-sync work before enumerating candidates", async () => {
    const db = openTestDb();
    migrate(db);
    let ready = false;
    registerIpc({
      db,
      provider: provider(() => {
        expect(ready).toBe(true);
        return [];
      }),
      beforeSync: async () => {
        await Promise.resolve();
        ready = true;
      },
    });

    await handlers.get(IPC.refresh)!();
  });

  it("serves the last-known rows when a sync throws, instead of rejecting to the renderer", async () => {
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
    const result = (await refresh()) as OverviewData;
    expect(result.sessions.map((s) => s.id)).toEqual(["seed"]);
  });

  it("attaches worktree identity from the persisted map, even when the directory is gone", async () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [{ ...seed, id: "wt", cwd: "/w/repo-wt" }, seed]);

    const analyticsDb = openTestDb();
    migrateAnalytics(analyticsDb);
    // Recorded while the worktree existed; the path itself no longer has to.
    upsertWorktree(analyticsDb, {
      cwd: "/w/repo-wt",
      repoRoot: "/w/repo",
      name: "repo-wt",
    });

    registerIpc({ db, provider: provider(() => []), analyticsDb });
    const overview = handlers.get(IPC.overview)!;
    const data = (await overview()) as OverviewData;
    const byId = new Map(data.sessions.map((s) => [s.id, s]));
    expect(byId.get("wt")?.worktree).toEqual({
      repoRoot: "/w/repo",
      repoLabel: "repo",
      name: "repo-wt",
    });
    // A cwd with no mapping (and no repo on disk) stays untagged — today's behavior.
    expect(byId.get("seed")?.worktree).toBeUndefined();
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

  it("carries the user's home directory for path abbreviation", () => {
    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider: provider(() => []) });
    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.homeDir).toBe(homedir());
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
  apiDurationMs: null,
  pr: null,
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
    upsertSessions(db, [seed]); // id 'seed', opus, zero computed usage
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
    // Account windows are the usage-API pass-through only (no usage service wired here), so they are
    // absent; the "subscription" mode is still proven by the capture's rate_limits evidence. The
    // capture's own window is now per-session — it lands on the session, not the account.
    expect(o.account).toEqual({ billingMode: "subscription" });
    const s = o.sessions.find((x) => x.id === "seed")!;
    expect(s.linesAdded).toBe(10);
    expect(s.contextPct).toBe(47);
    expect(s.rateLimits).toEqual({
      fiveHour: { usedPct: 20, resetsAt: expect.any(Number) },
    });
  });

  it("serves account null when there is no statusLine data (AC #4)", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({ db, provider: provider(() => []), statusLine: reader([]) });

    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account).toBeNull();
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
  it("returns api when a sample carries no rate_limits", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([lineSample({ sessionId: "seed" })]), // no rateLimits → api
    });
    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account).toEqual({ billingMode: "api" });
  });

  it("keeps a subscription account in subscription mode (subscription wins over api)", () => {
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
    });
    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account?.billingMode).toBe("subscription");
  });

  it("does not relabel a dormant subscription (all windows expired) as api — stays subscription", () => {
    // A real subscription gone idle still writes captures carrying rate_limits whose windows have reset.
    // The rate_limits history proves the account is a subscriber, not API billing — stays subscription.
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
    });
    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.account?.billingMode).toBe("subscription");
  });

  it("returns api when a sample has no rate_limits (no statusLine config needed)", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([lineSample({ sessionId: "seed" })]),
    });
    expect((handlers.get(IPC.overview)!() as OverviewData).account).toEqual({
      billingMode: "api",
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
    rename: (from: string, to: string) => {
      if (titles[from] === undefined || titles[to] !== undefined) return;
      titles[to] = titles[from];
      delete titles[from];
    },
  });

  it("persists the override via the store and applies it to the overview", async () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]); // title 'Seeded'
    const titles: Record<string, string> = {};
    registerIpc({
      db,
      provider: provider(() => []),
      sessionTitles: fakeStore(titles),
    });

    const o = (await handlers.get(IPC.renameSession)!(
      {},
      "seed",
      "  My Name  ",
    )) as OverviewData;
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

  it("clears the override on an empty title, reverting to the derived title", async () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]); // title 'Seeded'
    const titles: Record<string, string> = { seed: "MyName" };
    registerIpc({
      db,
      provider: provider(() => []),
      sessionTitles: fakeStore(titles),
    });
    const o = (await handlers.get(IPC.renameSession)!(
      {},
      "seed",
      "",
    )) as OverviewData;
    expect(titles).toEqual({});
    expect(o.sessions.find((s) => s.id === "seed")!.title).toBe("Seeded");
  });

  it("uses a successful native rename, clears a stale local override, and restates the index immediately", async () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    const titles: Record<string, string> = { seed: "Old local name" };
    const p = provider(() => [
      {
        id: "seed",
        agent: "claude",
        alive: false,
        cwd: "/w/p",
        transcriptMtimeMs: 0,
      },
    ]);
    p.restate = (_candidate, previous) => ({
      ...previous,
      title: "Native name",
    });
    const nativeSessionRename = vi.fn(() => Promise.resolve(true));
    registerIpc({
      db,
      provider: p,
      sessionTitles: fakeStore(titles),
      nativeSessionRename,
    });

    const o = (await handlers.get(IPC.renameSession)!(
      {},
      "seed",
      "Native name",
    )) as OverviewData;
    expect(nativeSessionRename).toHaveBeenCalledWith("seed", "Native name");
    expect(titles).toEqual({});
    expect(o.sessions.find((s) => s.id === "seed")?.title).toBe("Native name");
  });

  it("falls back to a local override when the provider-native rename is unavailable", async () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    const titles: Record<string, string> = {};
    registerIpc({
      db,
      provider: provider(() => []),
      sessionTitles: fakeStore(titles),
      nativeSessionRename: () => Promise.resolve(false),
    });

    const o = (await handlers.get(IPC.renameSession)!(
      {},
      "seed",
      "Local",
    )) as OverviewData;
    expect(titles).toEqual({ seed: "Local" });
    expect(o.sessions.find((s) => s.id === "seed")?.title).toBe("Local");
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

describe("registerIpc setSessionPinned", () => {
  // A tiny in-memory stand-in for the durable pin store, stamping a fixed clock.
  const fakePinStore = (pins: Record<string, number>) => ({
    read: () => pins,
    set: (id: string, pinned: boolean) => {
      if (pinned) pins[id] = 999;
      else delete pins[id];
    },
    rename: (from: string, to: string) => {
      if (pins[from] === undefined || pins[to] !== undefined) return;
      pins[to] = pins[from];
      delete pins[from];
    },
  });

  it("persists the pin via the store and stamps pinnedAtMs onto the overview", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    const pins: Record<string, number> = {};
    registerIpc({
      db,
      provider: provider(() => []),
      sessionPins: fakePinStore(pins),
    });

    const o = handlers.get(IPC.setSessionPinned)!(
      {},
      "seed",
      true,
    ) as OverviewData;
    expect(pins).toEqual({ seed: 999 });
    expect(o.sessions.find((s) => s.id === "seed")!.pinnedAtMs).toBe(999);
  });

  it("unpin clears the store and the overview field", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    const pins: Record<string, number> = { seed: 111 };
    registerIpc({
      db,
      provider: provider(() => []),
      sessionPins: fakePinStore(pins),
    });
    const o = handlers.get(IPC.setSessionPinned)!(
      {},
      "seed",
      false,
    ) as OverviewData;
    expect(pins).toEqual({});
    expect(o.sessions.find((s) => s.id === "seed")!.pinnedAtMs).toBeUndefined();
  });

  it("overview() also carries pins (applied in overviewNow, not just the setter)", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({
      db,
      provider: provider(() => []),
      sessionPins: fakePinStore({ seed: 42 }),
    });
    const o = handlers.get(IPC.overview)!() as OverviewData;
    expect(o.sessions.find((s) => s.id === "seed")!.pinnedAtMs).toBe(42);
  });

  it("serves an unpinned overview when no sessionPins dep is provided", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [seed]);
    registerIpc({ db, provider: provider(() => []) });
    const o = handlers.get(IPC.setSessionPinned)!(
      {},
      "seed",
      true,
    ) as OverviewData;
    expect(o.sessions.find((s) => s.id === "seed")!.pinnedAtMs).toBeUndefined();
  });
});

describe("registerIpc setProjectPlacement", () => {
  it("returns hidden, pinned, and unhidden state with mutual exclusion", async () => {
    const db = openTestDb();
    migrate(db);
    let clock = 100;
    const projectState: Record<
      string,
      { pinnedAtMs?: number; hiddenAtMs?: number }
    > = {};
    registerIpc({
      db,
      provider: provider(() => []),
      projectState: {
        read: () => ({ ...projectState }),
        setPlacement: (key, placement) => {
          if (placement === "ordinary") delete projectState[key];
          else
            projectState[key] =
              placement === "pinned"
                ? { pinnedAtMs: ++clock }
                : { hiddenAtMs: ++clock };
        },
      },
    });

    const hidden = (await handlers.get(IPC.setProjectPlacement)!(
      {},
      "/repo",
      "hidden",
    )) as OverviewData;
    expect(hidden.projectState["/repo"]).toEqual({ hiddenAtMs: 101 });

    const pinned = (await handlers.get(IPC.setProjectPlacement)!(
      {},
      "/repo",
      "pinned",
    )) as OverviewData;
    expect(pinned.projectState["/repo"]).toEqual({ pinnedAtMs: 102 });
    expect(pinned.projectState["/repo"].hiddenAtMs).toBeUndefined();

    const unhidden = (await handlers.get(IPC.setProjectPlacement)!(
      {},
      "/repo",
      "ordinary",
    )) as OverviewData;
    expect(unhidden.projectState["/repo"]).toBeUndefined();
  });

  it("includes project pins in overview and returns each persisted toggle", async () => {
    const db = openTestDb();
    migrate(db);
    const projectState: Record<string, { pinnedAtMs: number }> = {
      "/seed": { pinnedAtMs: 111 },
    };
    const projectPinStore = {
      read: () => ({ ...projectState }),
      setPlacement: (key: string, placement: string) => {
        if (placement === "pinned") projectState[key] = { pinnedAtMs: 999 };
        else delete projectState[key];
      },
    };
    registerIpc({
      db,
      provider: provider(() => []),
      projectState: projectPinStore,
    });

    expect(
      (handlers.get(IPC.overview)!() as OverviewData).projectState,
    ).toEqual({ "/seed": { pinnedAtMs: 111 } });
    const pinned = (await handlers.get(IPC.setProjectPlacement)!(
      {},
      "/repo",
      "pinned",
    )) as OverviewData;
    expect(projectState["/repo"]).toEqual({ pinnedAtMs: 999 });
    expect(pinned.projectState["/repo"]).toEqual({ pinnedAtMs: 999 });

    const unpinned = (await handlers.get(IPC.setProjectPlacement)!(
      {},
      "/repo",
      "ordinary",
    )) as OverviewData;
    expect(projectState["/repo"]).toBeUndefined();
    expect(unpinned.projectState).toEqual({ "/seed": { pinnedAtMs: 111 } });
  });

  it.each(["", "   ", "\t\n"])(
    "rejects an empty project key %j without mutating the store",
    async (key) => {
      const db = openTestDb();
      migrate(db);
      const projectState: Record<string, { pinnedAtMs: number }> = {};
      const projectPinStore = {
        read: () => ({ ...projectState }),
        setPlacement: (key: string, placement: string) => {
          if (placement === "pinned") projectState[key] = { pinnedAtMs: 999 };
          else delete projectState[key];
        },
      };
      registerIpc({
        db,
        provider: provider(() => []),
        projectState: projectPinStore,
      });

      const overview = (await handlers.get(IPC.setProjectPlacement)!(
        {},
        key,
        "pinned",
      )) as OverviewData;
      expect(projectState).toEqual({});
      expect(overview.projectState).toEqual({});
    },
  );

  it("rejects an invalid placement without mutating the store", () => {
    const db = openTestDb();
    migrate(db);
    let writes = 0;
    registerIpc({
      db,
      provider: provider(() => []),
      projectState: {
        read: () => ({}),
        setPlacement: () => {
          writes += 1;
        },
      },
    });
    handlers.get(IPC.setProjectPlacement)!({}, "/repo", "invalid");
    expect(writes).toBe(0);
  });

  it("serves the unchanged overview when persistence fails", () => {
    const db = openTestDb();
    migrate(db);
    const projectState = { "/seed": { pinnedAtMs: 111 } };
    registerIpc({
      db,
      provider: provider(() => []),
      projectState: {
        read: () => ({ ...projectState }),
        setPlacement: () => {
          throw new Error("disk full");
        },
      },
    });

    let overview: OverviewData | undefined;
    expect(() => {
      overview = handlers.get(IPC.setProjectPlacement)!(
        {},
        "/repo",
        "pinned",
      ) as OverviewData;
    }).not.toThrow();
    expect(overview?.projectState).toEqual(projectState);
  });
});

describe("registerIpc caffeinate", () => {
  it("serves off from the inert default when no caffeinate dep is wired", () => {
    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider: provider(() => []) });
    expect(handlers.get(IPC.caffeinateGet)!()).toBe(false);
    expect(handlers.get(IPC.caffeinateSet)!({}, true)).toBe(false);
  });

  it("toggles the wired blocker via caffeinate:set and reads it back via caffeinate:get", () => {
    const db = openTestDb();
    migrate(db);
    const started: string[] = [];
    const stopped: number[] = [];
    const caffeinate = createCaffeinate({
      blocker: {
        start: (type) => {
          started.push(type);
          return started.length;
        },
        stop: (id) => {
          stopped.push(id);
        },
        isStarted: (id) =>
          id >= 1 && id <= started.length && !stopped.includes(id),
      },
    });
    registerIpc({ db, provider: provider(() => []), caffeinate });

    const get = handlers.get(IPC.caffeinateGet)!;
    const set = handlers.get(IPC.caffeinateSet)!;
    expect(get()).toBe(false);
    expect(set({}, true)).toBe(true);
    expect(get()).toBe(true);
    expect(started).toEqual(["prevent-app-suspension"]);
    expect(set({}, false)).toBe(false);
    expect(get()).toBe(false);
    expect(stopped).toEqual([1]);
  });
});

describe("registerIpc appearance", () => {
  it("serves dark from the inert default when no appSettings dep is wired", () => {
    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider: provider(() => []) });
    expect(handlers.get(IPC.appearanceGetAppTheme)!()).toBe("dark");
    expect(handlers.get(IPC.appearanceGetTerminalTheme)!()).toBe("dark");
  });

  it("persists appTheme and syncs nativeTheme.themeSource", async () => {
    const db = openTestDb();
    migrate(db);
    const dir = mkdtempSync(join(tmpdir(), "cbw-ipc-appearance-"));
    const appSettings = createAppSettingsStore({ dir });
    registerIpc({ db, provider: provider(() => []), appSettings });

    const { nativeTheme } = await import("electron");
    handlers.get(IPC.appearanceSetAppTheme)!({}, "light");
    expect(handlers.get(IPC.appearanceGetAppTheme)!()).toBe("light");
    expect(nativeTheme.themeSource).toBe("light");

    rmSync(dir, { recursive: true, force: true });
  });

  it("persists terminalTheme independently of appTheme, without touching nativeTheme", async () => {
    const db = openTestDb();
    migrate(db);
    const dir = mkdtempSync(join(tmpdir(), "cbw-ipc-appearance-"));
    const appSettings = createAppSettingsStore({ dir });
    registerIpc({ db, provider: provider(() => []), appSettings });

    const { nativeTheme } = await import("electron");
    nativeTheme.themeSource = "system"; // reset before asserting it stays untouched below
    handlers.get(IPC.appearanceSetTerminalTheme)!({}, "light");
    expect(handlers.get(IPC.appearanceGetTerminalTheme)!()).toBe("light");
    expect(handlers.get(IPC.appearanceGetAppTheme)!()).toBe("dark");
    expect(nativeTheme.themeSource).toBe("system");

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("registerIpc locale", () => {
  it("serves en from the inert default when no appSettings dep is wired", () => {
    const db = openTestDb();
    migrate(db);
    registerIpc({ db, provider: provider(() => []) });
    expect(handlers.get(IPC.appearanceGetLocale)!()).toBe("en");
  });

  it("persists appLocale and normalizes stored aliases/garbage on read", () => {
    const db = openTestDb();
    migrate(db);
    const dir = mkdtempSync(join(tmpdir(), "cbw-ipc-locale-"));
    const appSettings = createAppSettingsStore({ dir });
    registerIpc({ db, provider: provider(() => []), appSettings });

    handlers.get(IPC.appearanceSetLocale)!({}, "zh");
    expect(handlers.get(IPC.appearanceGetLocale)!()).toBe("zh");

    // A hand-edited settings.json with an alias still reads as "zh"…
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ appLocale: "zh-CN" }),
    );
    expect(handlers.get(IPC.appearanceGetLocale)!()).toBe("zh");

    // …and garbage reads as "en", never reaching the renderer raw.
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ appLocale: "klingon" }),
    );
    expect(handlers.get(IPC.appearanceGetLocale)!()).toBe("en");

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("registerIpc statuslineGetStatus watch population", () => {
  it("counts only claude sessions — a live codex session must never inflate the watch", () => {
    const db = openTestDb();
    migrate(db);
    upsertSessions(db, [
      { ...seed, id: "claude-1", agent: "claude", state: "working" },
      { ...seed, id: "codex-1", agent: "codex", state: "working" },
    ]);
    registerIpc({ db, provider: provider(() => []) });
    const status = handlers.get(IPC.statuslineGetStatus)!() as {
      watchedSessions: number;
    };
    expect(status.watchedSessions).toBe(1);
  });
});
