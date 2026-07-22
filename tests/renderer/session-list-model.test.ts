import { describe, expect, it } from "vitest";
import {
  sortSessions,
  filterSessions,
  filterActive,
  filterGroupsActive,
  groupSessionsByProject,
  sessionForest,
  pinnedSessions,
  filterGroups,
  partitionProjectGroups,
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
  it("filterActive drops only ended, preserving order", () => {
    const w = mk({ id: "w", state: "working" });
    const e = mk({ id: "e", state: "ended" });
    const i = mk({ id: "i", state: "idle" });
    const wa = mk({ id: "wa", state: "waiting" });
    expect(filterActive([w, e, i, wa]).map((s) => s.id)).toEqual([
      "w",
      "i",
      "wa",
    ]);
  });

  it("a project with only ended sessions yields no group once filtered", () => {
    const a = mk({ id: "a", state: "working", project: "alpha" });
    const e1 = mk({ id: "e1", state: "ended", project: "beta" });
    expect(
      groupSessionsByProject(filterActive([a, e1])).map((g) => g.label),
    ).toEqual(["alpha"]);
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

  it("pinnedSessions keeps ended pins (the active filter never applies)", () => {
    const e = mk({ id: "e", state: "ended", pinnedAtMs: 100 });
    expect(pinnedSessions([e]).map((s) => s.id)).toEqual(["e"]);
  });

  it("filterGroupsActive keeps a folder whose sessions are all ended, as an empty group", () => {
    const a = mk({ id: "a", state: "working", project: "alpha", cwd: "/a" });
    const e1 = mk({ id: "e1", state: "ended", project: "beta", cwd: "/b" });
    const out = filterGroupsActive(groupSessionsByProject([a, e1]));
    expect(out.map((g) => g.label).sort()).toEqual(["alpha", "beta"]);
    expect(out.find((g) => g.label === "beta")!.sessions).toEqual([]);
    expect(
      out.find((g) => g.label === "alpha")!.sessions.map((s) => s.id),
    ).toEqual(["a"]);
  });

  it("filterGroupsActive preserves group identity and order", () => {
    const a = mk({
      id: "a",
      state: "ended",
      project: "alpha",
      cwd: "/a",
      lastActivityMs: 200,
    });
    const b = mk({
      id: "b",
      state: "working",
      project: "beta",
      cwd: "/b",
      lastActivityMs: 100,
    });
    const groups = groupSessionsByProject([a, b]);
    const out = filterGroupsActive(groups);
    expect(out.map((g) => g.key)).toEqual(groups.map((g) => g.key));
    expect(out.map((g) => g.cwd)).toEqual(groups.map((g) => g.cwd));
    expect(out.map((g) => g.label)).toEqual(groups.map((g) => g.label));
  });

  it("filterGroups preserves every group while combining visibility and agent filters", () => {
    const groups = groupSessionsByProject([
      mk({ id: "ac", cwd: "/a", state: "working", agent: "claude" }),
      mk({ id: "ae", cwd: "/a", state: "ended", agent: "claude" }),
      mk({ id: "bc", cwd: "/b", state: "idle", agent: "codex" }),
    ]);

    const filtered = filterGroups(groups, {
      visibility: "active",
      showAgentIcons: true,
      agent: "claude",
    });

    expect(filtered).toHaveLength(groups.length);
    expect(filtered.map((g) => g.key)).toEqual(groups.map((g) => g.key));
    expect(
      filtered
        .flatMap((g) => g.sessions)
        .every((s) => s.state !== "ended" && s.agent === "claude"),
    ).toBe(true);
    expect(filtered.find((g) => g.key === "/b")!.sessions).toEqual([]);
  });

  it("searching or active-filtering a child retains its ancestor context", () => {
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
        { visibility: "all", showAgentIcons: true, agent: "all" },
        "needle",
      )[0].sessions.map((session) => session.id),
    ).toEqual(["child", "parent"]);
    expect(
      filterGroupsActive(groups)[0].sessions.map((session) => session.id),
    ).toEqual(["child", "parent"]);
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
});
