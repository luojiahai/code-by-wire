import { num } from "./transcript-row";
import type { TokenSpeed } from "@shared/metrics";

/** Rolling-window length for the live speed readout, anchored to the last activity. The renderer
 *  hardcodes the matching label in panels/speed-window.ts (SPEED_WINDOW_LABEL) — keep the two in sync. */
export const SPEED_WINDOW_MS = 60_000;

interface Interval {
  start: number;
  end: number;
  input: number;
  output: number;
}

/** Merge overlapping/touching intervals so concurrent (e.g. subagent) work isn't double-counted in the
 *  active-duration denominator. Tokens are summed independently of the merge. */
function mergedDurationMs(intervals: Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const iv of sorted) {
    if (iv.start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = iv.start;
      curEnd = iv.end;
    } else if (iv.end > curEnd) {
      curEnd = iv.end;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

/**
 * Token throughput over the rolling window, across one or more transcripts (`rowGroups`: the main
 * transcript plus each subagent's). Pairs each user turn's timestamp with the following assistant
 * turn's timestamp WITHIN its own group to form an active interval; a repeated message id — within or
 * across groups — keeps its first interval start; its usage and end advance to the latest-timestamp
 * row for that id (a stale earlier duplicate is ignored; see UsageAccumulator for the last-wins
 * rule). Overlapping intervals merge in the duration denominator, so concurrent subagent work isn't
 * double-counted. With `windowMs > 0` only requests whose assistant timestamp falls within
 * `[latest - windowMs, latest]` count, and their intervals are clipped to that window's start.
 * `windowMs === 0` is the full-session average.
 * Rows flagged `isApiErrorMessage` never count; `isSidechain` rows are skipped in the first group
 * (the main transcript) only — subagent groups count in full (A4).
 * Returns null when no completed request remains or the merged active duration is zero.
 */
export function computeTokenSpeed(
  rowGroups: any[][],
  windowMs: number,
): TokenSpeed | null {
  const intervals: Interval[] = [];
  const byId = new Map<string, Interval>();
  let latest = 0;

  for (const [groupIndex, rows] of rowGroups.entries()) {
    let pendingUserTs: number | null = null; // pairing state never crosses a group boundary
    for (const row of rows) {
      const ts =
        typeof row?.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
      if (Number.isNaN(ts)) continue;
      // A4 (ccstatusline jsonl-metrics.ts:306, 516-525): an API-error row's partial usage is not
      // throughput; a MAIN-transcript sidechain row is a subagent echo whose real rows arrive in
      // their own group — counting both would double-count. Subagent groups count in full.
      if (row.isApiErrorMessage) continue;
      if (groupIndex === 0 && row.isSidechain) continue;
      if (row.type === "user" && !row.isMeta) {
        pendingUserTs = ts;
        continue;
      }
      if (row.type !== "assistant") continue;
      const usage = row.message?.usage;
      if (!usage || typeof usage !== "object") continue;
      const id =
        typeof row.message?.id === "string" ? row.message.id : undefined;
      const existing = id ? byId.get(id) : undefined;
      if (existing) {
        // The latest-timestamp snapshot of a repeated id is the turn's true completion: adopt its
        // usage AND end together (>= so a same-timestamp later row still wins the tie), and ignore a
        // stale earlier-timestamped duplicate so end and usage never decouple. The first-seen start
        // is kept untouched.
        if (ts >= existing.end) {
          existing.end = ts;
          existing.input = num(usage.input_tokens);
          existing.output = num(usage.output_tokens);
        }
      } else {
        const iv: Interval = {
          start: pendingUserTs ?? ts,
          end: ts,
          input: num(usage.input_tokens),
          output: num(usage.output_tokens),
        };
        if (id) byId.set(id, iv);
        intervals.push(iv);
        pendingUserTs = null;
      }
      if (ts > latest) latest = ts;
    }
  }

  if (intervals.length === 0) return null;
  const windowStart = windowMs > 0 ? latest - windowMs : -Infinity;
  const inWindow = intervals
    .filter((iv) => iv.end >= windowStart)
    .map((iv) => ({ ...iv, start: Math.max(iv.start, windowStart) }));
  if (inWindow.length === 0) return null;

  const durMs = mergedDurationMs(inWindow);
  if (durMs <= 0) return null;
  const sec = durMs / 1000;
  const input = inWindow.reduce((a, iv) => a + iv.input, 0);
  const output = inWindow.reduce((a, iv) => a + iv.output, 0);
  return {
    inputTps: input / sec,
    outputTps: output / sec,
    totalTps: (input + output) / sec,
  };
}
