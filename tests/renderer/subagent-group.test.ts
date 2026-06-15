import { describe, expect, it } from "vitest";
import type { Subagent } from "@shared/types";
import {
  INDIVIDUAL_GROUP_ID,
  type CollapseOverride,
  type SubagentGroup,
  groupCollapseDefault,
  groupHasFailure,
  groupIsLive,
  groupSpanMs,
  groupUniformType,
  groupSubagents,
  resolveCollapsed,
} from "../../src/renderer/src/workspace/panels/subagent-group";

/** A lane carrying only the fields the grouping reads. */
function lane(
  id: string,
  batchId: string | undefined,
  opts: Partial<Subagent> = {},
): Subagent {
  return {
    id,
    type: opts.type ?? "general-purpose",
    status: opts.status ?? "done",
    tokens: 0,
    toolCount: 0,
    durationMs: opts.durationMs ?? 0,
    startMs: opts.startMs,
    batchId,
  };
}

describe("groupSubagents", () => {
  it("is empty for no lanes", () => {
    expect(groupSubagents([])).toEqual([]);
  });

  it("groups two-plus lanes sharing a batchId into one batch group", () => {
    const groups = groupSubagents([lane("a", "b1"), lane("b", "b1")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("batch");
    expect(groups[0].id).toBe("b1");
    expect(groups[0].agents.map((a) => a.id).sort()).toEqual(["a", "b"]);
  });

  it("pools singleton batches and unknown-batch lanes into one trailing group", () => {
    const groups = groupSubagents([
      lane("a", "b1", { startMs: 0 }),
      lane("b", "b1", { startMs: 0 }),
      lane("c", "b2", { startMs: 5 }), // singleton batch -> pool
      lane("d", undefined, { startMs: 3 }), // no batch -> pool
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["batch", "individual"]);
    const pool = groups[1];
    expect(pool.id).toBe(INDIVIDUAL_GROUP_ID);
    // pool orders by startMs ascending: d(3) before c(5)
    expect(pool.agents.map((a) => a.id)).toEqual(["d", "c"]);
  });

  it("orders batch members by start ascending", () => {
    const g = groupSubagents([
      lane("a", "b1", { startMs: 30 }),
      lane("b", "b1", { startMs: 10 }),
      lane("c", "b1", { startMs: 20 }),
    ])[0];
    expect(g.agents.map((a) => a.id)).toEqual(["b", "c", "a"]);
  });

  it("orders batch groups by earliest start, pool last", () => {
    const groups = groupSubagents([
      lane("l1", "late", { startMs: 100 }),
      lane("l2", "late", { startMs: 100 }),
      lane("e1", "early", { startMs: 10 }),
      lane("e2", "early", { startMs: 10 }),
      lane("solo", undefined, { startMs: 5 }),
    ]);
    expect(groups.map((g) => g.id)).toEqual([
      "early",
      "late",
      INDIVIDUAL_GROUP_ID,
    ]);
  });

  it("breaks an unpositioned pool tie by id (NaN-safe)", () => {
    // Two pooled lanes with no startMs: -Infinity - -Infinity is NaN, so the id tiebreak must fire.
    const pool = groupSubagents([
      lane("z", undefined),
      lane("a", undefined),
    ])[0];
    expect(pool.id).toBe(INDIVIDUAL_GROUP_ID);
    expect(pool.agents.map((a) => a.id)).toEqual(["a", "z"]);
  });

  it("does not mutate its input", () => {
    const input = [
      lane("b", "x", { durationMs: 1 }),
      lane("a", "x", { durationMs: 9 }),
    ];
    const before = input.map((a) => a.id);
    groupSubagents(input);
    expect(input.map((a) => a.id)).toEqual(before);
  });
});

function grp(id: string, agents: Subagent[]): SubagentGroup {
  return { kind: "batch", id, agents };
}

describe("group predicates and collapse", () => {
  const live = grp("g", [lane("a", "g", { status: "working" })]);
  const doneClean = grp("g", [lane("a", "g", { status: "done" })]);
  const doneFail = grp("g", [
    lane("a", "g", { status: "done" }),
    lane("b", "g", { status: "failed" }),
  ]);

  it("detects live and failed groups", () => {
    expect(groupIsLive(live)).toBe(true);
    expect(groupIsLive(doneClean)).toBe(false);
    expect(groupHasFailure(doneFail)).toBe(true);
    expect(groupHasFailure(doneClean)).toBe(false);
  });

  it("collapses only a done, failure-free group by default", () => {
    expect(groupCollapseDefault(live)).toBe(false);
    expect(groupCollapseDefault(doneFail)).toBe(false);
    expect(groupCollapseDefault(doneClean)).toBe(true);
  });

  it("honours an override whose phase still matches, else the default", () => {
    // user expanded a done group: phase (live=false) matches, so it stays expanded
    const expanded: CollapseOverride = { collapsed: false, live: false };
    expect(resolveCollapsed(doneClean, expanded)).toBe(false);
    // override was set while live; group is now done, so the phase differs and the default (collapse) wins
    const setWhileLive: CollapseOverride = { collapsed: false, live: true };
    expect(resolveCollapsed(doneClean, setWhileLive)).toBe(true);
    // no override -> default
    expect(resolveCollapsed(doneClean, undefined)).toBe(true);
  });

  it("reports a uniform agent type, undefined when mixed", () => {
    expect(
      groupUniformType(
        grp("g", [
          lane("a", "g", { type: "Explore" }),
          lane("b", "g", { type: "Explore" }),
        ]),
      ),
    ).toBe("Explore");
    expect(
      groupUniformType(
        grp("g", [
          lane("a", "g", { type: "Explore" }),
          lane("b", "g", { type: "general-purpose" }),
        ]),
      ),
    ).toBeUndefined();
    // a single member is trivially uniform; an empty group has no type
    expect(
      groupUniformType(grp("g", [lane("a", "g", { type: "Explore" })])),
    ).toBe("Explore");
    expect(groupUniformType(grp("g", []))).toBeUndefined();
  });

  it("measures the group span: latest end minus earliest start", () => {
    const doneSpan = grp("g", [
      lane("a", "g", { startMs: 0, durationMs: 30000, status: "done" }),
      lane("b", "g", { startMs: 0, durationMs: 50000, status: "done" }),
    ]);
    expect(groupSpanMs(doneSpan, 999999)).toBe(50000);
    const liveSpan = grp("g", [
      lane("a", "g", { startMs: 0, status: "working" }),
    ]);
    expect(groupSpanMs(liveSpan, 22000)).toBe(22000);
    const unpositioned = grp("g", [
      lane("a", "g", { status: "done", durationMs: 5 }),
    ]);
    expect(groupSpanMs(unpositioned, 1000)).toBe(0);
  });
});
