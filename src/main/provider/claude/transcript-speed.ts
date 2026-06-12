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
 * Token throughput over the rolling window. Pairs each user turn's timestamp with the following
 * assistant turn's timestamp to form an active interval, summing that assistant turn's usage (deduped by
 * message id). With `windowMs > 0` only requests whose assistant timestamp falls within
 * `[latest - windowMs, latest]` count, and their intervals are clipped to that window's start.
 * `windowMs === 0` is the full-session average. Returns null when no completed request remains or the
 * merged active duration is zero.
 */
export function computeTokenSpeed(
  rows: any[],
  windowMs: number,
): TokenSpeed | null {
  const intervals: Interval[] = [];
  const counted = new Set<string>();
  let pendingUserTs: number | null = null;
  let latest = 0;

  for (const row of rows) {
    const ts =
      typeof row?.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    if (Number.isNaN(ts)) continue;
    if (row.type === "user" && !row.isMeta) {
      pendingUserTs = ts;
      continue;
    }
    if (row.type === "assistant") {
      const id =
        typeof row.message?.id === "string" ? row.message.id : undefined;
      const usage = row.message?.usage;
      if (!usage || typeof usage !== "object") continue;
      if (id && counted.has(id)) continue;
      if (id) counted.add(id);
      const start = pendingUserTs ?? ts;
      intervals.push({
        start,
        end: ts,
        input: num(usage.input_tokens),
        output: num(usage.output_tokens),
      });
      pendingUserTs = null;
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
