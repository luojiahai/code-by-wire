import type { Subagent } from "@shared/types";

// JSX-free dock logic, so the tests can import it under tsconfig.node.json (mirrors open-in-items.ts).

/** The dock's right-area tabs. */
export type DockTab = "turns" | "subagents";

/** The forest tallies the dock needs, gathered in a single walk: total nodes (the Subagents count badge)
 *  plus a per-status count. `working` is the live-fan-out signal and the collapsed tally's working count;
 *  `working`/`done`/`failed` together are the Subagents tab's running/done/failed tally. */
export interface SubagentStats {
  total: number;
  working: number;
  done: number;
  failed: number;
}

/** Fold the subagent forest once — children included — into its total and per-status node counts. One
 *  walk feeds the count badge, the live tally, the default-tab choice, and the tab's running/done/failed
 *  readout, so they can't disagree. */
export function subagentStats(subagents: Subagent[]): SubagentStats {
  return subagents.reduce<SubagentStats>(
    (acc, a) => {
      const child = a.children
        ? subagentStats(a.children)
        : { total: 0, working: 0, done: 0, failed: 0 };
      return {
        total: acc.total + 1 + child.total,
        working: acc.working + (a.status === "working" ? 1 : 0) + child.working,
        done: acc.done + (a.status === "done" ? 1 : 0) + child.done,
        failed: acc.failed + (a.status === "failed" ? 1 : 0) + child.failed,
      };
    },
    { total: 0, working: 0, done: 0, failed: 0 },
  );
}

/** The longest `durationMs` across the forest, children included — the reference max the Subagents tab's
 *  lane bars normalize against, so the long pole reads full and the rest scale to it. Empty/all-zero
 *  yields 0 (the lanes then all read as empty bars). */
export function maxSubagentDuration(subagents: Subagent[]): number {
  return subagents.reduce((max, a) => {
    const child = a.children ? maxSubagentDuration(a.children) : 0;
    return Math.max(max, a.durationMs, child);
  }, 0);
}

/** The dock's right tab defaults to Subagents while a fan-out is alive (any node working), Turns
 *  otherwise. */
export function defaultDockTab(stats: SubagentStats): DockTab {
  return stats.working > 0 ? "subagents" : "turns";
}
