import { describe, expect, it } from "vitest";
import type { Session } from "../../src/shared/types";
import {
  groupSessionsByProject,
  parentHint,
  UNGROUPED_LABEL,
} from "../../src/renderer/src/shell/session-list-model";

let seq = 0;
function mk(over: Partial<Session>): Session {
  seq += 1;
  return {
    id: `s${seq}`,
    title: `session ${seq}`,
    project: "proj",
    state: "idle",
    createdMs: 1000 + seq,
    lastActivityMs: 1000 + seq,
    ...over,
  } as Session;
}

describe("groupSessionsByProject", () => {
  it("groups by project, most-recently-active group first", () => {
    const a1 = mk({ project: "alpha", lastActivityMs: 100 });
    const b1 = mk({ project: "beta", lastActivityMs: 900 });
    const a2 = mk({ project: "alpha", lastActivityMs: 500 });
    const groups = groupSessionsByProject([a1, b1, a2]);
    expect(groups.map((g) => g.label)).toEqual(["beta", "alpha"]);
    expect(groups[1].sessions).toHaveLength(2);
  });

  it("keeps sortSessions order inside a group (live newest-created first, then ended by activity)", () => {
    const ended = mk({ project: "p", state: "ended", lastActivityMs: 9999 });
    const oldLive = mk({ project: "p", createdMs: 1, lastActivityMs: 1 });
    const newLive = mk({ project: "p", createdMs: 2, lastActivityMs: 2 });
    const [group] = groupSessionsByProject([ended, oldLive, newLive]);
    expect(group.sessions.map((s) => s.id)).toEqual([
      newLive.id,
      oldLive.id,
      ended.id,
    ]);
  });

  it("buckets sessions without a project under the ungrouped label", () => {
    const none = mk({ project: "" });
    const groups = groupSessionsByProject([none]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe(UNGROUPED_LABEL);
    expect(groups[0].key).toBe(UNGROUPED_LABEL);
    expect(groups[0].cwd).toBeUndefined();
  });

  it("returns an empty array for no sessions", () => {
    expect(groupSessionsByProject([])).toEqual([]);
  });

  it("splits same-named folders at different paths, hinting each parent", () => {
    const a = mk({ project: "test", cwd: "/Users/x/a/test" });
    const b = mk({ project: "test", cwd: "/Users/x/b/test" });
    const groups = groupSessionsByProject([a, b], "/Users/x");
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => [g.key, g.label, g.hint])).toEqual(
      expect.arrayContaining([
        ["/Users/x/a/test", "test", "~/a"],
        ["/Users/x/b/test", "test", "~/b"],
      ]),
    );
  });

  it("same cwd stays one group; distinct names get no hint", () => {
    const a1 = mk({ project: "app", cwd: "/Users/x/app" });
    const a2 = mk({ project: "app", cwd: "/Users/x/app" });
    const c = mk({ project: "cli", cwd: "/Users/x/cli" });
    const groups = groupSessionsByProject([a1, a2, c], "/Users/x");
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.hint === undefined)).toBe(true);
  });

  it("mixed collision: the path-keyed group hints, the cwd-less fallback doesn't", () => {
    const pathed = mk({ project: "test", cwd: "/Users/x/a/test" });
    const bare = mk({ project: "test", cwd: undefined });
    const groups = groupSessionsByProject([pathed, bare], "/Users/x");
    expect(groups).toHaveLength(2);
    const withPath = groups.find((g) => g.cwd);
    const without = groups.find((g) => !g.cwd);
    expect(withPath?.hint).toBe("~/a");
    expect(without?.hint).toBeUndefined();
  });

  it("merges worktree sessions into the main repo's group", () => {
    const main = mk({ project: "repo", cwd: "/w/repo", lastActivityMs: 100 });
    const wt = mk({
      project: "repo-wt",
      cwd: "/w/repo-wt",
      worktree: { repoRoot: "/w/repo", repoLabel: "repo", name: "repo-wt" },
      lastActivityMs: 200,
    });
    const groups = groupSessionsByProject([main, wt]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("/w/repo");
    expect(groups[0].label).toBe("repo");
    // Quick-add on the merged folder spawns in the main checkout.
    expect(groups[0].cwd).toBe("/w/repo");
    expect(groups[0].sessions).toHaveLength(2);
  });

  it("keys a worktree-only group on the repo root, even with no main-checkout session", () => {
    const wt = mk({
      project: "repo-wt",
      cwd: "/w/repo-wt",
      worktree: { repoRoot: "/w/repo", repoLabel: "repo", name: "repo-wt" },
    });
    const [g] = groupSessionsByProject([wt]);
    expect(g.key).toBe("/w/repo");
    expect(g.label).toBe("repo");
    expect(g.cwd).toBe("/w/repo");
  });
});

describe("parentHint", () => {
  it("abbreviates a parent under home", () => {
    expect(parentHint("/Users/x/a/test", "/Users/x")).toBe("~/a");
  });
  it("returns ~ for a cwd directly under home", () => {
    expect(parentHint("/Users/x/test", "/Users/x")).toBe("~");
  });
  it("keeps paths outside home absolute", () => {
    expect(parentHint("/srv/deploys/test", "/Users/x")).toBe("/srv/deploys");
  });
  it("degrades to the raw parent when homeDir is unknown", () => {
    expect(parentHint("/Users/x/a/test", "")).toBe("/Users/x/a");
  });
});
