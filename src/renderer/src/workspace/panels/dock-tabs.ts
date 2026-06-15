import type { Subagent } from "@shared/types";

// JSX-free dock logic, so the tests can import it under tsconfig.node.json (mirrors open-in-items.ts).

/** The dock's right-area tabs. */
export type DockTab = "turns" | "subagents";

/** The forest tallies the dock needs, gathered in a single walk: total nodes (the Subagents count badge)
 *  and working nodes (the live-fan-out signal and the collapsed tally's working count). */
export interface SubagentStats {
  total: number;
  working: number;
}

/** Fold the subagent forest once — children included — into its total and working node counts. One walk
 *  feeds the count badge, the live tally, and the default-tab choice, so they can't disagree. */
export function subagentStats(subagents: Subagent[]): SubagentStats {
  return subagents.reduce<SubagentStats>(
    (acc, a) => {
      const child = a.children
        ? subagentStats(a.children)
        : { total: 0, working: 0 };
      return {
        total: acc.total + 1 + child.total,
        working: acc.working + (a.status === "working" ? 1 : 0) + child.working,
      };
    },
    { total: 0, working: 0 },
  );
}

/** The dock's right tab defaults to Subagents while a fan-out is alive (any node working), Turns
 *  otherwise. */
export function defaultDockTab(stats: SubagentStats): DockTab {
  return stats.working > 0 ? "subagents" : "turns";
}
