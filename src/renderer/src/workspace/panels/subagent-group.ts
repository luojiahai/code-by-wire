import type { Subagent } from "@shared/types";
import { laneInterval } from "./dock-tabs";

// JSX-free dock logic so the tests can import it under tsconfig.node.json (mirrors dock-tabs.ts).

/** The synthetic id of the pooled group: every lone serial dispatch and every unlocatable lane. */
export const INDIVIDUAL_GROUP_ID = "__individual__";

/** A band on the Subagents gantt. A "batch" is the set of agents fired in one assistant turn (a shared
 *  batchId, two or more members), drawn on its own time axis. The single "individual" group pools every
 *  lone dispatch on a shared axis and always renders last. */
export interface SubagentGroup {
  kind: "batch" | "individual";
  id: string;
  agents: Subagent[];
}

/** A batch's earliest positioned start, or Infinity when no member is positioned (sorts it after
 *  positioned batches; the id tiebreak keeps order deterministic past the resulting NaN). */
export function groupStartMs(group: SubagentGroup): number {
  let min = Infinity;
  for (const a of group.agents)
    if (a.startMs !== undefined && a.startMs < min) min = a.startMs;
  return min;
}

/** Lane order within any group: start ascending, an unpositioned lane first (matching the timeline's
 *  left edge). The same rule for a batch and the pool — the bars already encode start (x) and duration
 *  (width), so the row order just follows the timeline rather than re-ranking by a second dimension. Two
 *  unpositioned lanes yield NaN from -Infinity - -Infinity, which is falsy, so the id tiebreak fires. */
function orderByStart(agents: Subagent[]): Subagent[] {
  return [...agents].sort(
    (a, b) =>
      (a.startMs ?? -Infinity) - (b.startMs ?? -Infinity) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Partition the flat lane list into batch groups plus one pooled group. A batchId shared by two or more
 * lanes is a batch (its own axis); a singleton batch or a lane with no batchId joins the pool (shared
 * axis), which always sorts last. Batch groups sort by earliest start, and lanes within every group sort
 * by start too. Pure: never mutates the input, same input yields the same output.
 */
export function groupSubagents(lanes: Subagent[]): SubagentGroup[] {
  const buckets = new Map<string, Subagent[]>();
  const pool: Subagent[] = [];
  for (const a of lanes) {
    if (a.batchId === undefined) {
      pool.push(a);
      continue;
    }
    const arr = buckets.get(a.batchId) ?? [];
    arr.push(a);
    buckets.set(a.batchId, arr);
  }
  const batches: SubagentGroup[] = [];
  for (const [id, agents] of buckets) {
    if (agents.length >= 2)
      batches.push({ kind: "batch", id, agents: orderByStart(agents) });
    else pool.push(...agents);
  }
  batches.sort(
    (x, y) => groupStartMs(x) - groupStartMs(y) || x.id.localeCompare(y.id),
  );
  if (pool.length > 0)
    batches.push({
      kind: "individual",
      id: INDIVIDUAL_GROUP_ID,
      agents: orderByStart(pool),
    });
  return batches;
}

/** A manual collapse choice plus the live phase it was made under, so it can lapse on a phase flip
 *  (mirrors the dock tab auto-follow `pick` in StructureDock). */
export interface CollapseOverride {
  collapsed: boolean;
  live: boolean;
}

/** A group is live while any member is still working. */
export function groupIsLive(group: SubagentGroup): boolean {
  return group.agents.some((a) => a.status === "working");
}

/** A group carries a failure when any member failed. */
export function groupHasFailure(group: SubagentGroup): boolean {
  return group.agents.some((a) => a.status === "failed");
}

/** The default: a finished, failure-free group collapses; a live group or one with a failure stays
 *  open (failures pop, matching the lane colour language). */
export function groupCollapseDefault(group: SubagentGroup): boolean {
  return !groupIsLive(group) && !groupHasFailure(group);
}

/** The effective collapsed state: a manual override wins while the group's live phase is unchanged,
 *  otherwise the default applies. So a freshly finished clean batch auto-collapses even if expanded
 *  while live, and a done batch the user expands by hand stays expanded. */
export function resolveCollapsed(
  group: SubagentGroup,
  override: CollapseOverride | undefined,
): boolean {
  if (override !== undefined && override.live === groupIsLive(group))
    return override.collapsed;
  return groupCollapseDefault(group);
}

/** The agent type shared by every member, or undefined when mixed (the header omits it then). */
export function groupUniformType(group: SubagentGroup): string | undefined {
  const first = group.agents[0]?.type;
  return group.agents.every((a) => a.type === first) ? first : undefined;
}

/** The group's wall-clock span: latest member end minus earliest start, reusing laneInterval so a
 *  working member runs to `now`. Zero when no member is positioned. */
export function groupSpanMs(group: SubagentGroup, now: number): number {
  const start = groupStartMs(group);
  if (!Number.isFinite(start)) return 0;
  let end = start;
  for (const a of group.agents) {
    const iv = laneInterval(a, start, now);
    if (iv.end > end) end = iv.end;
  }
  return end - start;
}
