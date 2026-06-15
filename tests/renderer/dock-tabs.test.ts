import { describe, expect, it } from "vitest";
import type { Subagent } from "@shared/types";
import {
  defaultDockTab,
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

describe("subagentStats", () => {
  it("is all zero for an empty forest", () => {
    expect(subagentStats([])).toEqual({ total: 0, working: 0 });
  });
  it("counts the whole forest and its working nodes, children included", () => {
    expect(
      subagentStats([
        sub("a", "working", [sub("a1", "done"), sub("a2", "working")]),
        sub("b", "failed"),
      ]),
    ).toEqual({ total: 4, working: 2 });
  });
  it("counts a nested working child", () => {
    expect(subagentStats([sub("a", "done", [sub("a1", "working")])])).toEqual({
      total: 2,
      working: 1,
    });
  });
});

describe("defaultDockTab", () => {
  it("defaults to turns with no live fan-out", () => {
    expect(defaultDockTab({ total: 0, working: 0 })).toBe("turns");
    expect(defaultDockTab(subagentStats([sub("a", "done")]))).toBe("turns");
  });
  it("defaults to subagents while a fan-out is alive", () => {
    expect(defaultDockTab(subagentStats([sub("a", "working")]))).toBe(
      "subagents",
    );
  });
});
