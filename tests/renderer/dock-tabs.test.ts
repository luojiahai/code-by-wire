import { describe, expect, it } from "vitest";
import type { Subagent } from "@shared/types";
import {
  countSubagents,
  countWorkingSubagents,
  defaultDockTab,
  hasWorkingSubagent,
} from "../../src/renderer/src/workspace/panels/dock-tabs";

/** A minimal Subagent for the helper tests — only the fields the helpers read. */
function sub(
  id: string,
  status: Subagent["status"],
  children?: Subagent[],
): Subagent {
  return { id, type: "general-purpose", status, tokens: 0, durationMs: 0, children };
}

describe("hasWorkingSubagent", () => {
  it("is false for an empty forest", () => {
    expect(hasWorkingSubagent([])).toBe(false);
  });
  it("is false when every agent is done or failed", () => {
    expect(hasWorkingSubagent([sub("a", "done"), sub("b", "failed")])).toBe(false);
  });
  it("is true when a root agent is working", () => {
    expect(hasWorkingSubagent([sub("a", "done"), sub("b", "working")])).toBe(true);
  });
  it("is true when only a nested child is working", () => {
    expect(hasWorkingSubagent([sub("a", "done", [sub("a1", "working")])])).toBe(true);
  });
});

describe("countSubagents", () => {
  it("is zero for an empty forest", () => {
    expect(countSubagents([])).toBe(0);
  });
  it("counts the whole forest, children included", () => {
    expect(
      countSubagents([
        sub("a", "done", [sub("a1", "done"), sub("a2", "working")]),
        sub("b", "failed"),
      ]),
    ).toBe(4);
  });
});

describe("countWorkingSubagents", () => {
  it("counts only working nodes, children included", () => {
    expect(
      countWorkingSubagents([
        sub("a", "working", [sub("a1", "done"), sub("a2", "working")]),
        sub("b", "failed"),
      ]),
    ).toBe(2);
  });
});

describe("defaultDockTab", () => {
  it("defaults to turns with no live fan-out", () => {
    expect(defaultDockTab([])).toBe("turns");
    expect(defaultDockTab([sub("a", "done")])).toBe("turns");
  });
  it("defaults to subagents while a fan-out is alive", () => {
    expect(defaultDockTab([sub("a", "working")])).toBe("subagents");
  });
});
