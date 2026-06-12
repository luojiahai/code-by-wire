/**
 * Pure geometry for the rail's diagrams — kept React-free so it unit-tests in the node env (the repo
 * has no DOM test harness). Colors flow through as opaque CSS strings (var(--color-*) or color-mix),
 * so these helpers never need to know the palette.
 */

export interface Segment {
  value: number;
  /** Any CSS color string — a token var, a color-mix, a hex. */
  color: string;
}

/** Clamp a percentage into 0–100. Shared with the rail's account gauges (rail-account) so the 0–100
 *  clamp lives in one React-free, node-testable place. */
export const clampPct = (n: number): number => Math.min(100, Math.max(0, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Each value as its percentage share of the total. Assumes all values ≥ 0. All-zero (or empty) yields
 *  zeros — no NaN. */
export function segmentPercents(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  return values.map((v) => (v / total) * 100);
}

/** A single-value progress ring: `fill` from 0 to pct, `track` the rest. pct clamps to 0..100. */
export function ringGradient(pct: number, fill: string, track: string): string {
  const p = clampPct(pct);
  return `conic-gradient(${fill} 0% ${p}%, ${track} ${p}% 100%)`;
}

/**
 * A multi-segment donut as a conic-gradient. Segments sit end to end by their share; intermediate
 * boundaries round to two decimals and the final segment is pinned to 100% so rounding never leaves a
 * seam. A zero total renders the solid track (the empty state).
 */
export function donutGradient(segments: Segment[], track: string): string {
  const pcts = segmentPercents(segments.map((s) => s.value));
  if (pcts.every((p) => p === 0)) return `conic-gradient(${track} 0% 100%)`;
  let cursor = 0;
  const stops = segments.map((s, i) => {
    const start = round2(cursor);
    cursor += pcts[i];
    const end = i === segments.length - 1 ? 100 : round2(cursor);
    return `${s.color} ${start}% ${end}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

/** A rate's share of a reference max, as a 0..100 percentage. Zero/negative max yields 0. */
export function ratePct(value: number, max: number): number {
  if (max <= 0) return 0;
  return round2(clampPct((value / max) * 100));
}
