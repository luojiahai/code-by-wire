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

/** Clamp a percentage into 0–100. Shared with the Settings account gauges so the 0–100
 *  clamp lives in one React-free, node-testable place. */
export const clampPct = (n: number): number => Math.min(100, Math.max(0, n));
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A delta as a percentage of a window span, clamped 0–100. The shared primitive behind a Gantt lane's
 *  left offset and width and the now-playhead's position (dock-tabs / SubagentsTab), so the three clamp
 *  the same way. A zero/negative span yields 0. */
export const spanPct = (delta: number, span: number): number =>
  span > 0 ? clampPct((delta / span) * 100) : 0;

/** Each value as its percentage share of the total. Assumes all values ≥ 0. All-zero (or empty) yields
 *  zeros — no NaN. */
export function segmentPercents(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  return values.map((v) => (v / total) * 100);
}

// --- BarSeries geometry (#114): a daily stacked-bar chart's scale, ticks, and segment layout. Pure and
// React-free so the node-env tests reach it; the SVG component (charts.tsx) maps these fractions to pixels.

/**
 * Round a positive value up to a "nice" axis maximum — the smallest 1/2/5 x 10^n at or above it — so the
 * Y axis tops out on a round magnitude and its evenly divided ticks read as round numbers. A zero or
 * negative data max yields 1, so an all-zero range still draws a 0..1 axis rather than collapsing.
 */
export function niceAxisMax(dataMax: number): number {
  if (!Number.isFinite(dataMax) || dataMax <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(dataMax)));
  const norm = dataMax / pow; // 1 <= norm < 10
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * pow;
}

/**
 * Up to `count` + 1 evenly spaced tick values from 0 to `axisMax` inclusive, ascending. With a nice axisMax
 * (see niceAxisMax) the steps land on round numbers — the Y-axis gridline labels. Values are rounded to
 * integers (tokens are whole); consecutive duplicates that rounding introduces on a small axis are
 * collapsed, so an all-zero range (axisMax 1) yields [0, 1] rather than [0, 0, 1, 1, 1] — keeping the tick
 * values (and the chart's per-tick React keys) unique. A zero or negative axis yields [0].
 */
export function axisTicks(axisMax: number, count = 4): number[] {
  if (!Number.isFinite(axisMax) || axisMax <= 0) return [0];
  const step = axisMax / count;
  const all = Array.from({ length: count + 1 }, (_, i) => Math.round(i * step));
  // The rounded sequence is monotonic non-decreasing, so dropping consecutive equals yields the unique set.
  return all.filter((v, i) => i === 0 || v !== all[i - 1]);
}

/** One segment of a stacked bar: its color and its bottom (`y0`) and top (`y1`) edges as fractions of the
 *  plot height, 0 = bottom and 1 = the axis max. The SVG maps these to rect y/height at any pixel height. */
export interface StackBand {
  color: string;
  y0: number;
  y1: number;
}

/**
 * Lay out one bar's stacked segments bottom-up. Each value becomes a band stacked from the bottom in array
 * order; heights are the value's share of `axisMax` (the absolute scale across all bars, NOT the bar's own
 * sum — so a light day reads short against a heavy one). Negative values are floored to zero. A zero
 * axisMax yields all-zero-height bands. Colors pair by index; a missing color is the empty string.
 */
export function stackBands(
  values: number[],
  colors: string[],
  axisMax: number,
): StackBand[] {
  if (!Number.isFinite(axisMax) || axisMax <= 0) {
    return values.map((_, i) => ({ color: colors[i] ?? "", y0: 0, y1: 0 }));
  }
  let acc = 0;
  return values.map((v, i) => {
    const y0 = acc / axisMax;
    acc += Math.max(0, v);
    return { color: colors[i] ?? "", y0, y1: acc / axisMax };
  });
}
