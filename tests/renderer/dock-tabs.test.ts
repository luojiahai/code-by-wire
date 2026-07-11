import { describe, expect, it } from "vitest";
import type { Subagent, Task, BackgroundShell, Monitor } from "@shared/types";
import {
  defaultDockTab,
  dockHasActivity,
  flattenSubagents,
  resolveDockCollapsed,
  subagentStats,
} from "../../src/renderer/src/workspace/panels/dock-tabs";

/** A minimal Subagent for the helper tests — only the fields the helpers read. */
function sub(
  id: string,
  status: Subagent["status"],
  children?: Subagent[],
): Subagent {
  return {
    id,
    type: "general-purpose",
    status,
    tokens: 0,
    toolCount: 0,
    durationMs: 0,
    children,
  };
}

describe("subagentStats", () => {
  it("is all zero for an empty forest", () => {
    expect(subagentStats([])).toEqual({
      total: 0,
      working: 0,
      done: 0,
      failed: 0,
    });
  });
  it("counts the whole forest by status, children included", () => {
    expect(
      subagentStats([
        sub("a", "working", [sub("a1", "done"), sub("a2", "working")]),
        sub("b", "failed"),
      ]),
    ).toEqual({ total: 4, working: 2, done: 1, failed: 1 });
  });
  it("counts a nested working child", () => {
    expect(subagentStats([sub("a", "done", [sub("a1", "working")])])).toEqual({
      total: 2,
      working: 1,
      done: 1,
      failed: 0,
    });
  });
});

describe("defaultDockTab", () => {
  it("defaults to subagents while a fan-out is alive", () => {
    expect(defaultDockTab(subagentStats([sub("a", "working")]))).toBe(
      "subagents",
    );
    expect(
      defaultDockTab(subagentStats([sub("a", "working"), sub("b", "done")])),
    ).toBe("subagents");
  });
  it("defaults to tasks when idle (no working subagent)", () => {
    expect(defaultDockTab({ total: 0, working: 0, done: 0, failed: 0 })).toBe(
      "tasks",
    );
    expect(defaultDockTab(subagentStats([sub("a", "done")]))).toBe("tasks");
  });
  it("defaults to monitors when one is running and no fan-out is alive", () => {
    expect(
      defaultDockTab({ total: 0, working: 0, done: 0, failed: 0 }, true),
    ).toBe("monitors");
  });
  it("prefers subagents over a running monitor while a fan-out is alive", () => {
    expect(defaultDockTab(subagentStats([sub("a", "working")]), true)).toBe(
      "subagents",
    );
  });
});

describe("flattenSubagents", () => {
  it("is empty for an empty forest", () => {
    expect(flattenSubagents([])).toEqual([]);
  });
  it("returns roots in order when there is no nesting", () => {
    expect(
      flattenSubagents([sub("a", "done"), sub("b", "working")]).map(
        (s) => s.id,
      ),
    ).toEqual(["a", "b"]);
  });
  it("flattens children depth-first, each parent before its subtree", () => {
    const forest = [
      sub("a", "done", [sub("a1", "done"), sub("a2", "working")]),
      sub("b", "failed"),
    ];
    expect(flattenSubagents(forest).map((s) => s.id)).toEqual([
      "a",
      "a1",
      "a2",
      "b",
    ]);
  });
});

const task = (status: Task["status"]): Task => ({ status }) as Task;
const shell = (status: BackgroundShell["status"]): BackgroundShell =>
  ({ status }) as BackgroundShell;
const monitor = (status: Monitor["status"]): Monitor => ({ status }) as Monitor;

describe("dockHasActivity", () => {
  const idle = { total: 0, working: 0, done: 0, failed: 0 };
  it("is false when nothing is in progress, working, or running", () => {
    expect(dockHasActivity([], idle, [])).toBe(false);
    expect(
      dockHasActivity([task("pending"), task("completed")], idle, [
        shell("completed"),
        shell("killed"),
      ]),
    ).toBe(false);
  });
  it("is true when a subagent is working", () => {
    expect(dockHasActivity([], subagentStats([sub("a", "working")]), [])).toBe(
      true,
    );
  });
  it("is true when a task is in progress", () => {
    expect(dockHasActivity([task("in_progress")], idle, [])).toBe(true);
  });
  it("is true when a shell is running", () => {
    expect(dockHasActivity([], idle, [shell("running")])).toBe(true);
  });
  it("is true when a monitor is running", () => {
    expect(dockHasActivity([], idle, [], [monitor("running")])).toBe(true);
  });
  it("is false when the only monitor has ended", () => {
    expect(dockHasActivity([], idle, [], [monitor("completed")])).toBe(false);
  });
});

describe("resolveDockCollapsed", () => {
  it("collapses when idle and expands when active, with no override", () => {
    expect(resolveDockCollapsed(false, null)).toBe(true);
    expect(resolveDockCollapsed(true, null)).toBe(false);
  });
  it("honors a manual override made under the same activity phase", () => {
    // manually collapsed while active -> stays collapsed
    expect(resolveDockCollapsed(true, { collapsed: true, active: true })).toBe(
      true,
    );
    // manually expanded while idle -> stays expanded
    expect(
      resolveDockCollapsed(false, { collapsed: false, active: false }),
    ).toBe(false);
  });
  it("lapses a manual override once the activity phase flips", () => {
    // collapsed under active:true, now idle -> auto rule (collapsed)
    expect(
      resolveDockCollapsed(false, { collapsed: false, active: true }),
    ).toBe(true);
    // expanded under active:false, now active -> auto rule (expanded)
    expect(resolveDockCollapsed(true, { collapsed: true, active: false })).toBe(
      false,
    );
  });
});
