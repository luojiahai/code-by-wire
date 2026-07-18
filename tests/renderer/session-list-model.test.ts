import { describe, expect, it } from "vitest";
import {
  sortSessions,
  filterSessions,
  filterActive,
  filterGroupsActive,
  groupSessionsByProject,
  pinnedSessions,
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
});
