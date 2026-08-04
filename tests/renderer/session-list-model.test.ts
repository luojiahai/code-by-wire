import { describe, expect, it } from "vitest";
import {
  activeSessionCount,
  sortSessions,
  filterSessions,
  capSessionForest,
  countFamilySessions,
  groupSessionsByProject,
  isSessionFamilyCollapsed,
  sessionForest,
  pinnedSessions,
  filterGroups,
  partitionProjectGroups,
  SESSIONS_PER_FOLDER,
} from "../../src/renderer/src/shell/session-list-model";
import type { Session } from "@shared/types";

const mk = (o: Partial<Session>): Session => ({
  id: "s",
  title: "Session",
  project: "proj",
  state: "idle",
  management: "managed",
  agent: "claude",
  resumable: true,
  model: "sonnet",
  contextPct: 0,
  contextWindow: 200_000,
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  },
  lastActivityMs: 0,
  createdMs: 0,
  ...o,
});

describe("session list model", () => {
  it("active (createdMs desc) before ended (lastActivityMs desc)", () => {
    const a = mk({
      id: "a",
      state: "working",
      createdMs: 100,
      lastActivityMs: 100,
    });
    const b = mk({
      id: "b",
      state: "idle",
      createdMs: 200,
      lastActivityMs: 150,
    });
    const e = mk({
      id: "e",
      state: "ended",
      createdMs: 50,
      lastActivityMs: 300,
    });
    expect(sortSessions([a, b, e]).map((s) => s.id)).toEqual(["b", "a", "e"]);
  });
  it("filters by title/project, case-insensitive", () => {
    const a = mk({ id: "a", title: "Auth", project: "web" });
    const b = mk({ id: "b", title: "DB", project: "api" });
    expect(filterSessions([a, b], "AUT").map((s) => s.id)).toEqual(["a"]);
  });
  it("filters by the merged repo label so repo-name search finds worktree sessions", () => {
    const wt = mk({
      id: "wt",
      title: "port terminal",
      project: "feat-x",
      worktree: { repoRoot: "/w/repo", repoLabel: "repo", name: "feat-x" },
    });
    const other = mk({ id: "o", title: "other", project: "beta" });
    expect(filterSessions([wt, other], "REPO").map((s) => s.id)).toEqual([
      "wt",
    ]);
  });

  it("filters by the repo label so a repo-name search finds a subdirectory session", () => {
    const sub = mk({
      id: "sub",
      title: "port terminal",
      project: "api",
      repoRoot: "/w/repo",
      repoLabel: "repo",
    });
    const other = mk({ id: "o", title: "other", project: "beta" });
    expect(filterSessions([sub, other], "REPO").map((s) => s.id)).toEqual([
      "sub",
    ]);
  });

  it("pinnedSessions keeps only pinned sessions, newest pin first", () => {
    const a = mk({ id: "a", pinnedAtMs: 100 });
    const b = mk({ id: "b" });
    const c = mk({ id: "c", pinnedAtMs: 300 });
    expect(pinnedSessions([a, b, c]).map((s) => s.id)).toEqual(["c", "a"]);
  });

  it("pinnedSessions composes with filterSessions for search", () => {
    const a = mk({ id: "a", title: "Auth", pinnedAtMs: 100 });
    const b = mk({ id: "b", title: "DB", pinnedAtMs: 200 });
    expect(
      pinnedSessions(filterSessions([a, b], "auth")).map((s) => s.id),
    ).toEqual(["a"]);
  });

  it("pinnedSessions keeps ended pins (the folder cap never reaches them)", () => {
    const e = mk({ id: "e", state: "ended", pinnedAtMs: 100 });
    expect(pinnedSessions([e]).map((s) => s.id)).toEqual(["e"]);
  });

  it("filterGroups keeps ended sessions and preserves every group while applying the agent filter", () => {
    const groups = groupSessionsByProject([
      mk({ id: "ac", cwd: "/a", state: "working", agent: "claude" }),
      mk({ id: "ae", cwd: "/a", state: "ended", agent: "claude" }),
      mk({ id: "bc", cwd: "/b", state: "idle", agent: "codex" }),
    ]);

    const filtered = filterGroups(groups, {
      showAgentIcons: true,
      agent: "claude",
    });

    expect(filtered).toHaveLength(groups.length);
    expect(filtered.map((g) => g.key)).toEqual(groups.map((g) => g.key));
    // Ended sessions survive: the folder cap, not a filter, decides what the sidebar shows.
    expect(
      filtered.find((g) => g.key === "/a")!.sessions.map((s) => s.id),
    ).toEqual(["ac", "ae"]);
    expect(filtered.find((g) => g.key === "/b")!.sessions).toEqual([]);
  });

  it("a search query narrows to matches and still respects the agent filter", () => {
    const active = mk({
      id: "a",
      title: "auth flow",
      state: "working",
      project: "alpha",
    });
    const ended = mk({
      id: "e",
      title: "auth spike",
      state: "ended",
      project: "alpha",
    });
    const unrelated = mk({
      id: "u",
      title: "db migration",
      state: "ended",
      project: "alpha",
    });
    const endedCodex = mk({
      id: "ec",
      title: "auth port",
      state: "ended",
      agent: "codex",
      project: "alpha",
    });
    const groups = groupSessionsByProject([
      active,
      ended,
      unrelated,
      endedCodex,
    ]);
    const preferences = {
      showAgentIcons: true,
      agent: "claude",
    } as const;

    expect(
      filterGroups(groups, preferences, "auth")[0].sessions.map((s) => s.id),
    ).toEqual(["a", "e"]);
    // Without a query every claude session survives, ended ones included.
    expect(
      filterGroups(groups, preferences)[0].sessions.map((s) => s.id),
    ).toEqual(["a", "e", "u"]);
  });

  it("capSessionForest fills the cap with the newest ended families", () => {
    const sessions = [
      mk({ id: "live", state: "working", createdMs: 500 }),
      mk({ id: "e1", state: "ended", lastActivityMs: 400 }),
      mk({ id: "e2", state: "ended", lastActivityMs: 300 }),
      mk({ id: "e3", state: "ended", lastActivityMs: 200 }),
      mk({ id: "e4", state: "ended", lastActivityMs: 100 }),
    ];

    const { visible, hidden } = capSessionForest(sessionForest(sessions), 3);
    expect(visible.map((n) => n.session.id)).toEqual(["live", "e1", "e2"]);
    expect(hidden.map((n) => n.session.id)).toEqual(["e3", "e4"]);
  });

  it("capSessionForest hides nothing when the folder fits", () => {
    const sessions = [
      mk({ id: "a", state: "ended", lastActivityMs: 200 }),
      mk({ id: "b", state: "ended", lastActivityMs: 100 }),
    ];
    const { visible, hidden } = capSessionForest(sessionForest(sessions), 5);
    expect(visible.map((n) => n.session.id)).toEqual(["a", "b"]);
    expect(hidden).toEqual([]);
  });

  it("capSessionForest keeps every live family past the cap, hiding only ended ones", () => {
    const sessions = [
      mk({ id: "l1", state: "working", createdMs: 100 }),
      mk({ id: "l2", state: "waiting", createdMs: 200 }),
      mk({ id: "l3", state: "idle", createdMs: 300 }),
      mk({ id: "e1", state: "ended", lastActivityMs: 50 }),
    ];

    const { visible, hidden } = capSessionForest(sessionForest(sessions), 2);
    expect(visible.map((n) => n.session.id).sort()).toEqual(["l1", "l2", "l3"]);
    expect(hidden.map((n) => n.session.id)).toEqual(["e1"]);
  });

  it("capSessionForest counts a family as one slot and never splits it", () => {
    const sessions = [
      mk({ id: "root", state: "ended", lastActivityMs: 400 }),
      mk({
        id: "kid-a",
        parentSessionId: "root",
        state: "ended",
        lastActivityMs: 390,
      }),
      mk({
        id: "kid-b",
        parentSessionId: "root",
        state: "ended",
        lastActivityMs: 380,
      }),
      mk({ id: "e1", state: "ended", lastActivityMs: 300 }),
      mk({ id: "e2", state: "ended", lastActivityMs: 200 }),
    ];

    const { visible, hidden } = capSessionForest(sessionForest(sessions), 2);
    // The three-session family occupies exactly one of the two slots.
    expect(visible.map((n) => n.session.id)).toEqual(["root", "e1"]);
    expect(visible[0].children.map((n) => n.session.id)).toEqual([
      "kid-a",
      "kid-b",
    ]);
    expect(hidden.map((n) => n.session.id)).toEqual(["e2"]);
  });

  it("capSessionForest treats an ended root with a live descendant as a live family", () => {
    const sessions = [
      mk({ id: "stale-root", state: "ended", lastActivityMs: 10 }),
      mk({
        id: "live-kid",
        parentSessionId: "stale-root",
        state: "working",
        createdMs: 900,
        lastActivityMs: 900,
      }),
      mk({ id: "e1", state: "ended", lastActivityMs: 800 }),
      mk({ id: "e2", state: "ended", lastActivityMs: 700 }),
    ];

    const { visible, hidden } = capSessionForest(sessionForest(sessions), 1);
    expect(visible.map((n) => n.session.id)).toEqual(["stale-root"]);
    expect(hidden.map((n) => n.session.id)).toEqual(["e1", "e2"]);
  });

  it("capSessionForest suspends the cap when handed Infinity (what search does)", () => {
    const sessions = [
      mk({ id: "e1", state: "ended", lastActivityMs: 300 }),
      mk({ id: "e2", state: "ended", lastActivityMs: 200 }),
      mk({ id: "e3", state: "ended", lastActivityMs: 100 }),
    ];
    const { visible, hidden } = capSessionForest(
      sessionForest(sessions),
      Infinity,
    );
    expect(visible.map((n) => n.session.id)).toEqual(["e1", "e2", "e3"]);
    expect(hidden).toEqual([]);
  });

  it("countFamilySessions counts buried sessions, not slots", () => {
    const sessions = [
      mk({ id: "root", state: "ended", lastActivityMs: 400 }),
      mk({ id: "kid", parentSessionId: "root", state: "ended" }),
      mk({ id: "grandkid", parentSessionId: "kid", state: "ended" }),
      mk({ id: "lone", state: "ended", lastActivityMs: 100 }),
    ];
    const forest = sessionForest(sessions);
    // Two top-level entries, four sessions between them.
    expect(forest).toHaveLength(2);
    expect(countFamilySessions(forest)).toBe(4);
    expect(countFamilySessions([])).toBe(0);
  });

  it("caps folders at five entries by default", () => {
    expect(SESSIONS_PER_FOLDER).toBe(5);
  });

  it("searching a child retains its ancestor context", () => {
    const parent = mk({
      id: "parent",
      title: "Main task",
      cwd: "/a",
      state: "ended",
    });
    const child = mk({
      id: "child",
      title: "Needle worker",
      cwd: "/a",
      state: "working",
      threadKind: "subagent",
      parentSessionId: "parent",
    });
    const groups = groupSessionsByProject([parent, child]);
    expect(
      filterGroups(
        groups,
        { showAgentIcons: true, agent: "all" },
        "needle",
      )[0].sessions.map((session) => session.id),
    ).toEqual(["child", "parent"]);
  });

  it("orders search results by matching sessions, not unrelated project activity", () => {
    const oldMatch = mk({
      id: "old-match",
      title: "Needle from before",
      cwd: "/old",
      lastActivityMs: 100,
    });
    const recentNonmatch = mk({
      id: "recent-nonmatch",
      title: "Unrelated recent work",
      cwd: "/old",
      lastActivityMs: 1_000,
    });
    const newMatch = mk({
      id: "new-match",
      title: "Newer needle",
      cwd: "/new",
      lastActivityMs: 500,
    });

    const groups = filterGroups(
      groupSessionsByProject([oldMatch, recentNonmatch, newMatch]),
      { showAgentIcons: true, agent: "all" },
      "needle",
    );

    expect(groups.map((group) => group.key)).toEqual(["/new", "/old"]);
    expect(groups[1].sessions.map((session) => session.id)).toEqual([
      "old-match",
    ]);
  });

  it("builds a sorted forest and degrades missing parents and cycles to roots", () => {
    const parent = mk({ id: "parent", createdMs: 1 });
    const child = mk({
      id: "child",
      createdMs: 2,
      threadKind: "subagent",
      parentSessionId: "parent",
      state: "working",
    });
    const grandchild = mk({
      id: "grandchild",
      threadKind: "subagent",
      parentSessionId: "child",
      state: "ended",
    });
    const orphan = mk({
      id: "orphan",
      threadKind: "subagent",
      parentSessionId: "missing",
    });
    const cycleA = mk({ id: "cycle-a", parentSessionId: "cycle-b" });
    const cycleB = mk({ id: "cycle-b", parentSessionId: "cycle-a" });
    const forest = sessionForest([
      parent,
      child,
      grandchild,
      orphan,
      cycleA,
      cycleB,
    ]);
    const parentNode = forest.find((node) => node.session.id === "parent")!;
    expect(parentNode.children[0].session.id).toBe("child");
    expect(parentNode.children[0].children[0].session.id).toBe("grandchild");
    expect(parentNode.descendantCount).toBe(2);
    expect(parentNode.activeDescendantCount).toBe(1);
    expect(forest.map((node) => node.session.id)).toEqual(
      expect.arrayContaining(["orphan", "cycle-a", "cycle-b"]),
    );
  });

  it("collapses families by default and changes state only through an explicit override", () => {
    expect(isSessionFamilyCollapsed(true, undefined)).toBe(true);
    expect(isSessionFamilyCollapsed(true, false)).toBe(false);
    expect(isSessionFamilyCollapsed(true, true)).toBe(true);
    expect(isSessionFamilyCollapsed(false, true)).toBe(false);
  });

  it("sorts families by aggregate descendant liveness and activity", () => {
    const staleRoot = mk({
      id: "stale-root",
      state: "ended",
      createdMs: 1,
      lastActivityMs: 1,
    });
    const activeChild = mk({
      id: "active-child",
      parentSessionId: "stale-root",
      state: "working",
      createdMs: 400,
      lastActivityMs: 400,
    });
    const liveRoot = mk({
      id: "live-root",
      state: "idle",
      createdMs: 300,
      lastActivityMs: 300,
    });
    const endedFamily = mk({
      id: "ended-family",
      state: "ended",
      lastActivityMs: 10,
    });
    const endedChild = mk({
      id: "ended-child",
      parentSessionId: "ended-family",
      state: "ended",
      lastActivityMs: 200,
    });
    const endedRoot = mk({
      id: "ended-root",
      state: "ended",
      lastActivityMs: 100,
    });

    expect(
      sessionForest([
        staleRoot,
        activeChild,
        liveRoot,
        endedFamily,
        endedChild,
        endedRoot,
      ]).map((node) => node.session.id),
    ).toEqual(["stale-root", "live-root", "ended-family", "ended-root"]);
  });

  it("partitionProjectGroups sorts pins newest-first and preserves other order", () => {
    const groups = groupSessionsByProject([
      mk({ id: "a", cwd: "/a", lastActivityMs: 300 }),
      mk({ id: "c", cwd: "/c", lastActivityMs: 200 }),
      mk({ id: "b", cwd: "/b", lastActivityMs: 100 }),
      mk({ id: "d", cwd: "/d", lastActivityMs: 50 }),
    ]);

    const result = partitionProjectGroups(groups, {
      "/b": { pinnedAtMs: 200 },
      "/a": { pinnedAtMs: 100 },
      "/c": { hiddenAtMs: 300 },
    });
    expect(result.pinned.map((g) => g.key)).toEqual(["/b", "/a"]);
    expect(result.others.map((g) => g.key)).toEqual(["/d"]);
    expect(result.hidden.map((g) => g.key)).toEqual(["/c"]);
    expect([...result.pinned, ...result.others, ...result.hidden]).toHaveLength(
      groups.length,
    );
  });

  it("partitionProjectGroups only pins groups with a stable cwd", () => {
    const pathGroup = {
      key: "/repo",
      cwd: "/repo",
      label: "repo",
      sessions: [mk({ id: "path", cwd: "/repo" })],
    };
    const fallbackGroup = {
      key: "repo",
      label: "repo",
      sessions: [mk({ id: "fallback", cwd: undefined })],
    };

    const result = partitionProjectGroups([pathGroup, fallbackGroup], {
      "/repo": { pinnedAtMs: 100 },
      repo: { hiddenAtMs: 200 },
    });

    expect(result.pinned.map((g) => g.key)).toEqual(["/repo"]);
    expect(result.others.map((g) => g.key)).toEqual(["repo"]);
    expect(result.hidden).toEqual([]);
  });

  it("sorts hidden projects newest-first", () => {
    const groups = groupSessionsByProject([
      mk({ id: "a", cwd: "/a", lastActivityMs: 300 }),
      mk({ id: "b", cwd: "/b", lastActivityMs: 200 }),
    ]);
    const result = partitionProjectGroups(groups, {
      "/a": { hiddenAtMs: 1 },
      "/b": { hiddenAtMs: 2 },
    });
    expect(result.hidden.map((g) => g.key)).toEqual(["/b", "/a"]);
  });

  it("activeSessionCount counts every live state and no ended one", () => {
    expect(
      activeSessionCount([
        mk({ id: "w", state: "working" }),
        mk({ id: "a", state: "waiting" }),
        mk({ id: "i", state: "idle" }),
        mk({ id: "e", state: "ended" }),
      ]),
    ).toBe(3);
  });

  it("activeSessionCount counts nested children, which a group's flat list holds", () => {
    const group = groupSessionsByProject([
      mk({ id: "root", cwd: "/repo", state: "ended" }),
      mk({
        id: "child",
        cwd: "/repo",
        state: "working",
        parentSessionId: "root",
      }),
      mk({
        id: "grandchild",
        cwd: "/repo",
        state: "waiting",
        parentSessionId: "child",
      }),
    ])[0];
    expect(activeSessionCount(group.sessions)).toBe(2);
  });

  it("activeSessionCount is 0 for a folder whose sessions all ended", () => {
    expect(
      activeSessionCount([
        mk({ id: "a", state: "ended" }),
        mk({ id: "b", state: "ended" }),
      ]),
    ).toBe(0);
    expect(activeSessionCount([])).toBe(0);
  });
});
