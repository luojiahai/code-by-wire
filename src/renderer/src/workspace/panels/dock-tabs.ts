import type { Subagent } from "@shared/types";

// JSX-free dock logic, so the tests can import it under tsconfig.node.json (mirrors open-in-items.ts).

/** The dock's right-area tabs. */
export type DockTab = "turns" | "subagents";

/** A fan-out is "alive" when any subagent in the forest is still Working. Recurses children so a nested
 *  working agent counts. */
export function hasWorkingSubagent(subagents: Subagent[]): boolean {
  return subagents.some(
    (a) =>
      a.status === "working" ||
      (a.children ? hasWorkingSubagent(a.children) : false),
  );
}

/** Total nodes in the forest, children included — the Subagents tab's count badge. */
export function countSubagents(subagents: Subagent[]): number {
  return subagents.reduce(
    (n, a) => n + 1 + (a.children ? countSubagents(a.children) : 0),
    0,
  );
}

/** Working nodes in the forest, children included — the collapsed tally bar's live count. */
export function countWorkingSubagents(subagents: Subagent[]): number {
  return subagents.reduce(
    (n, a) =>
      n +
      (a.status === "working" ? 1 : 0) +
      (a.children ? countWorkingSubagents(a.children) : 0),
    0,
  );
}

/** The dock's right tab defaults to Subagents while a fan-out is alive, Turns otherwise. */
export function defaultDockTab(subagents: Subagent[]): DockTab {
  return hasWorkingSubagent(subagents) ? "subagents" : "turns";
}
