import { describe, expect, it } from "vitest";
import type { Subagent } from "@shared/types";
import {
  defaultDockTab,
  maxSubagentDuration,
  subagentStats,
} from "../../src/renderer/src/workspace/panels/dock-tabs";

/** A minimal Subagent for the helper tests — only the fields the helpers read. */
function sub(
  id: string,
  status: Subagent["status"],
  over?: { durationMs?: number; children?: Subagent[] },
): Subagent {
  return {
    id,
    type: "general-purpose",
    status,
    tokens: 0,
    durationMs: over?.durationMs ?? 0,
    children: over?.children,
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
  it("counts the whole forest per status, children included", () => {
    expect(
      subagentStats([
        sub("a", "working", {
          children: [sub("a1", "done"), sub("a2", "working")],
        }),
        sub("b", "failed"),
      ]),
    ).toEqual({ total: 4, working: 2, done: 1, failed: 1 });
  });
  it("counts a nested working child", () => {
    expect(
      subagentStats([sub("a", "done", { children: [sub("a1", "working")] })]),
    ).toEqual({ total: 2, working: 1, done: 1, failed: 0 });
  });
});

describe("maxSubagentDuration", () => {
  it("is zero for an empty forest", () => {
    expect(maxSubagentDuration([])).toBe(0);
  });
  it("returns the longest lane across a flat forest", () => {
    expect(
      maxSubagentDuration([
        sub("a", "done", { durationMs: 1200 }),
        sub("b", "working", { durationMs: 3400 }),
        sub("c", "failed", { durationMs: 800 }),
      ]),
    ).toBe(3400);
  });
  it("finds the max in a nested child", () => {
    expect(
      maxSubagentDuration([
        sub("a", "done", {
          durationMs: 1000,
          children: [sub("a1", "done", { durationMs: 9000 })],
        }),
      ]),
    ).toBe(9000);
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
