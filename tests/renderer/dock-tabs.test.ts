import { describe, expect, it } from "vitest";
import type { Subagent } from "@shared/types";
import {
  defaultDockTab,
  flattenSubagents,
  laneBand,
  laneWindow,
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
    durationMs: 0,
    children,
  };
}

/** A Subagent with explicit timing for the geometry tests. `startMs` may be undefined (unpositioned). */
function timed(
  id: string,
  status: Subagent["status"],
  startMs: number | undefined,
  durationMs: number,
): Subagent {
  return {
    id,
    type: "general-purpose",
    status,
    tokens: 0,
    durationMs,
    startMs,
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
  it("defaults to turns with no live fan-out", () => {
    expect(defaultDockTab({ total: 0, working: 0, done: 0, failed: 0 })).toBe(
      "turns",
    );
    expect(defaultDockTab(subagentStats([sub("a", "done")]))).toBe("turns");
  });
  it("defaults to subagents while a fan-out is alive", () => {
    expect(defaultDockTab(subagentStats([sub("a", "working")]))).toBe(
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

describe("laneWindow", () => {
  it("falls back to now for a forest with no positioned lane", () => {
    expect(laneWindow([], 1000)).toEqual({ start: 1000, end: 1000 });
  });
  it("freezes at the exact latest end when all lanes are done", () => {
    expect(
      laneWindow(
        [timed("a", "done", 0, 30000), timed("b", "done", 10000, 5000)],
        100000,
      ),
    ).toEqual({ start: 0, end: 30000 });
  });
  it("extends to a nice rung at or past now while a lane works", () => {
    expect(
      laneWindow(
        [timed("a", "done", 0, 18000), timed("b", "working", 20000, 0)],
        34000,
      ),
    ).toEqual({ start: 0, end: 50000 });
  });
  it("steps the window up in discrete rungs as now grows", () => {
    const lanes = [timed("a", "working", 0, 0)];
    expect(laneWindow(lanes, 49000).end).toBe(50000);
    expect(laneWindow(lanes, 51000).end).toBe(100000);
  });
  it("falls back to now when a working lane has no start", () => {
    expect(laneWindow([timed("a", "working", undefined, 0)], 5000).start).toBe(
      5000,
    );
  });
});

describe("laneBand", () => {
  it("positions a lane by start offset and width", () => {
    expect(laneBand(20, 80, 0, 100)).toEqual({ left: 20, width: 60 });
  });
  it("floors a near-instant lane to the minimum width", () => {
    expect(laneBand(0, 1, 0, 100)).toEqual({ left: 0, width: 3 });
  });
  it("clamps left so a floored sliver stays on screen", () => {
    expect(laneBand(99, 100, 0, 100)).toEqual({ left: 97, width: 3 });
  });
  it("floors at the left for a zero-width window", () => {
    expect(laneBand(5, 10, 50, 50)).toEqual({ left: 0, width: 3 });
  });
});
