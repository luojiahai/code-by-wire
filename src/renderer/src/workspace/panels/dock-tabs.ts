import type { Subagent } from "@shared/types";
import { niceAxisMax, round2, spanPct } from "../../ui/charts-geom";

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

/** A zeroed tally, frozen: the shared reduce seed and no-children base, so the two can't drift and the
 *  read-only return for an empty forest can't be mutated by a caller. */
const ZERO_STATS: SubagentStats = Object.freeze({
  total: 0,
  working: 0,
  done: 0,
  failed: 0,
});

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

/** A near-instant or just-spawned lane still shows this sliver (a percent of the window span), so it
 *  never vanishes at the floor. */
const MIN_BAR_PCT = 3;

/** A lane's position on the timeline window: a left offset and width, both in percent. */
export interface LaneBand {
  left: number;
  width: number;
}

/** The time window the lane timeline is drawn against, in epoch ms. */
export interface LaneWindow {
  start: number;
  end: number;
}

/** One lane's [start, end] on the timeline, in epoch ms. An unpositioned lane (no startMs) anchors at the
 *  window's left edge; a working lane runs to `now`, a finished one to its start plus its measured span.
 *  The single source the window (laneWindow) and the band (SubagentLane) both read, so the two can't drift
 *  out of sync — change the anchoring here and both follow. */
export function laneInterval(
  agent: Subagent,
  windowStart: number,
  now: number,
): { start: number; end: number } {
  const start = agent.startMs ?? windowStart;
  const end = agent.status === "working" ? now : start + agent.durationMs;
  return { start, end };
}

/** The window the lanes span. `start` is the earliest lane start. While any lane works, the window
 *  extends to a "nice" rung at or past `now` (niceAxisMax) so it rescales in discrete steps with headroom
 *  ahead of the playhead; once all lanes are done it snaps to the exact latest end so the finished
 *  timeline fills the width. A forest with no positioned lane falls back to `now`. */
export function laneWindow(lanes: Subagent[], now: number): LaneWindow {
  let start = Infinity;
  for (const l of lanes)
    if (l.startMs !== undefined && l.startMs < start) start = l.startMs;
  if (!Number.isFinite(start)) start = now;
  let latest = start;
  let anyWorking = false;
  for (const l of lanes) {
    if (l.status === "working") anyWorking = true;
    const { end } = laneInterval(l, start, now);
    if (end > latest) latest = end;
  }
  const end = anyWorking ? start + niceAxisMax(latest - start) : latest;
  return { start, end };
}

/** Position one lane on the window as left/width percents. For a working lane the caller passes `now` as
 *  `endMs`. Width is floored to MIN_BAR_PCT so a near-instant lane stays visible, and left is clamped so a
 *  floored sliver never overflows the right edge. A zero/negative span yields a floored bar at the left. */
export function laneBand(
  startMs: number,
  endMs: number,
  windowStart: number,
  windowEnd: number,
): LaneBand {
  const span = windowEnd - windowStart;
  if (!(span > 0)) return { left: 0, width: MIN_BAR_PCT };
  const left = spanPct(startMs - windowStart, span);
  const width = Math.max(MIN_BAR_PCT, spanPct(endMs - startMs, span));
  return { left: round2(Math.min(left, 100 - width)), width: round2(width) };
}
