import type { Subagent } from "@shared/types";

// JSX-free dock logic, so the tests can import it under tsconfig.node.json (mirrors open-in-items.ts).

/** The dock's right-area tabs. */
export type DockTab = "turns" | "subagents";

/** The forest tallies the dock needs, gathered in a single walk: total nodes (the Subagents count badge)
 *  and the per-status counts (the live-fan-out signal, the collapsed tally's working count, and the
 *  Subagents tab's running / done / failed tally). */
export interface SubagentStats {
  total: number;
  working: number;
  done: number;
  failed: number;
}

/** A zeroed tally: the reduce seed and the no-children base, so the two can't drift. */
const ZERO_STATS: SubagentStats = { total: 0, working: 0, done: 0, failed: 0 };

/** Fold the subagent forest once — children included — into its total and per-status node counts. One
 *  walk feeds the count badge, the tab tally, the live signal, and the default-tab choice, so they can't
 *  disagree. */
export function subagentStats(subagents: Subagent[]): SubagentStats {
  return subagents.reduce<SubagentStats>((acc, a) => {
    const child = a.children ? subagentStats(a.children) : ZERO_STATS;
    return {
      total: acc.total + 1 + child.total,
      working: acc.working + (a.status === "working" ? 1 : 0) + child.working,
      done: acc.done + (a.status === "done" ? 1 : 0) + child.done,
      failed: acc.failed + (a.status === "failed" ? 1 : 0) + child.failed,
    };
  }, ZERO_STATS);
}

/** The dock's right tab defaults to Subagents while a fan-out is alive (any node working), Turns
 *  otherwise. */
export function defaultDockTab(stats: SubagentStats): DockTab {
  return stats.working > 0 ? "subagents" : "turns";
}

/** Flatten the subagent forest to a flat lane list, depth-first, each parent before its subtree. The
 *  forest is already built in dispatch order (roots by first timestamp), so lanes read oldest-first.
 *  Fan-outs are flat in practice; this collapses the rare nesting into one list. */
export function flattenSubagents(subagents: Subagent[]): Subagent[] {
  const lanes: Subagent[] = [];
  for (const a of subagents) {
    lanes.push(a);
    if (a.children) lanes.push(...flattenSubagents(a.children));
  }
  return lanes;
}
