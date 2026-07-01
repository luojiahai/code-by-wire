import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./atoms";
import {
  segmentPercents,
  niceAxisMax,
  axisTicks,
  stackBands,
  type Segment,
} from "./charts-geom";
import type { CalendarCell } from "./contributions-geom";

/** A 100%-stacked horizontal bar. Widths come from each segment's share of the sum. */
export function StackedBar({
  segments,
  height = 13,
  className,
}: {
  segments: Segment[];
  height?: number;
  className?: string;
}) {
  const widths = segmentPercents(segments.map((s) => s.value));
  return (
    <div
      className={cx("flex overflow-hidden rounded-full bg-ink-850", className)}
      style={{ height }}
    >
      {segments.map((s, i) => (
        <span
          key={i}
          className="h-full shrink-0"
          style={{ width: `${widths[i]}%`, background: s.color }}
        />
      ))}
    </div>
  );
}

/** One labeled throughput row: label, a mini-bar, a right-aligned value. `pct` is the already-scaled
 *  0..100 fill the caller passes in; we clamp defensively. */
export function RateBar({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="w-12 shrink-0 text-aux text-fg-muted">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-850">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            background: color,
          }}
        />
      </span>
      <span className="w-[52px] shrink-0 text-right font-mono text-aux tabular-nums text-fg">
        {value}
      </span>
    </div>
  );
}

/**
 * A horizontal fill gauge with caution/danger zones and threshold ticks — the cockpit's "fuel gauge".
 * `pct` fills 0..100 in `fill`; the zones tint the track from `caution`% and `danger`% so the redline is
 * visible even before the fill reaches it, and a tick marks the danger threshold ahead of the fill.
 */
export function FillGauge({
  pct,
  fill,
  caution,
  danger,
  height = 10,
}: {
  pct: number;
  fill: string;
  caution: number;
  danger: number;
  height?: number;
}) {
  const w = Math.min(100, Math.max(0, pct));
  return (
    <div
      className="relative overflow-hidden rounded-full bg-ink-850"
      style={{ height }}
    >
      {/* Caution and danger zones, drawn under the fill so the redline shows where the fill hasn't reached. */}
      <span
        className="absolute inset-y-0"
        style={{
          left: `${caution}%`,
          right: `${100 - danger}%`,
          background:
            "color-mix(in srgb, var(--color-accent) 12%, transparent)",
        }}
      />
      <span
        className="absolute inset-y-0"
        style={{
          left: `${danger}%`,
          right: 0,
          background:
            "color-mix(in srgb, var(--color-accent) 22%, transparent)",
        }}
      />
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${w}%`, background: fill }}
      />
      <span
        className="absolute -inset-y-px w-px bg-accent"
        style={{ left: `${danger}%` }}
      />
    </div>
  );
}

/**
 * A trend sparkline — a tiny area+line of recent samples, the cockpit's vertical-speed instrument. The
 * x-axis is sample index (not exact time), the y-axis scales to the run's max. Renders nothing below two
 * samples; the caller shows the headline number alone until the buffer fills. The path uses a 0..100
 * percent x-space stretched to width (non-scaling stroke keeps the line crisp); the current-value dot is
 * an HTML node pinned to the right edge so it never distorts.
 */
export function Sparkline({
  values,
  height = 44,
}: {
  values: number[];
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const n = values.length;
  const pad = 2;
  const y = (v: number): number =>
    pad + (1 - Math.max(0, v) / max) * (height - pad * 2);
  const x = (i: number): number => (i / (n - 1)) * 100;
  const line = values
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`)
    .join(" ");
  const area =
    `M0,${height} ` +
    values.map((v, i) => `L${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ") +
    ` L100,${height} Z`;
  return (
    <div className="relative" style={{ height }}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <path
          d={area}
          fill="color-mix(in srgb, var(--color-data-2) 16%, transparent)"
        />
        <path
          d={line}
          fill="none"
          stroke="var(--color-data-1)"
          strokeWidth={1.4}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute right-0 h-1.5 w-1.5 rounded-full bg-fg"
        style={{ top: y(values[n - 1]), transform: "translateY(-50%)" }}
      />
    </div>
  );
}

/** One day's column for the BarSeries: a stable React key and the segments to stack bottom-up (each a raw
 *  value and a CSS color). The caller decides what the segments mean (token kind or model). */
export interface DayColumn {
  key: string;
  segments: { value: number; color: string }[];
}

/** The plot's SVG viewBox height. Bars are drawn in this fixed coordinate space and stretched to the
 *  container with preserveAspectRatio="none" (plain fills, so the non-uniform scale is invisible). */
const PLOT_VH = 100;

/**
 * A hand-rolled SVG stacked-bar time-series (#114): one stacked column per day, a readable Y axis, and a
 * hover tooltip. Scale, ticks, and segment heights come from charts-geom (niceAxisMax / axisTicks /
 * stackBands) against the largest column total, so every bar shares one absolute scale and a light day
 * reads short. The bars are fill-only rects in a non-uniform viewBox; the Y-axis gridlines and labels and
 * the tooltip are HTML overlays (crisp at any size). `renderTooltip(i)` supplies the hovered day's content;
 * `xLabels` are the thinned date labels the caller wants under the axis.
 */
export function BarSeries({
  columns,
  formatTick,
  xLabels,
  renderTooltip,
}: {
  columns: DayColumn[];
  formatTick: (n: number) => string;
  xLabels: { index: number; label: string }[];
  renderTooltip: (index: number) => ReactNode;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const n = columns.length;
  const dataMax = Math.max(
    0,
    ...columns.map((c) =>
      c.segments.reduce((s, seg) => s + Math.max(0, seg.value), 0),
    ),
  );
  const axisMax = niceAxisMax(dataMax);
  const ticks = axisTicks(axisMax);

  // pt-2 on the chart row reserves headroom for the top Y-axis tick label: it's centered on the top
  // gridline, so it half-overflows the plot's top edge and would otherwise crowd the panel title above.
  return (
    <div className="flex gap-2 pt-2">
      {/* Y-axis labels, bottom-aligned to their tick fraction. */}
      <div className="relative h-40 w-12 shrink-0">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-0 translate-y-[calc(-50%_+_5px)] text-micro leading-none tabular-nums text-fg-faint"
            style={{ bottom: `${(t / axisMax) * 100}%` }}
          >
            {formatTick(t)}
          </span>
        ))}
      </div>
      {/* Plot + x labels. */}
      <div className="min-w-0 flex-1">
        <div className="relative h-40">
          {/* Gridlines behind the bars. */}
          {ticks.map((t) => (
            <span
              key={t}
              className="pointer-events-none absolute inset-x-0 border-t border-ink-850"
              style={{ bottom: `${(t / axisMax) * 100}%` }}
            />
          ))}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${Math.max(n, 1)} ${PLOT_VH}`}
            preserveAspectRatio="none"
            onMouseLeave={() => setHovered(null)}
          >
            {/* Bars: fill-only rects, so the non-uniform stretch shows no distortion. */}
            {columns.map((col, i) =>
              stackBands(
                col.segments.map((s) => s.value),
                col.segments.map((s) => s.color),
                axisMax,
              ).map((band, j) =>
                band.y1 > band.y0 ? (
                  <rect
                    key={`${col.key}-${j}`}
                    x={i + 0.1}
                    width={0.8}
                    y={PLOT_VH * (1 - band.y1)}
                    height={PLOT_VH * (band.y1 - band.y0)}
                    fill={band.color}
                  />
                ) : null,
              ),
            )}
            {/* Full-height transparent hit areas, one per column, on top so hover works over the gaps. */}
            {columns.map((col, i) => (
              <rect
                key={`hit-${col.key}`}
                x={i}
                width={1}
                y={0}
                height={PLOT_VH}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
              />
            ))}
          </svg>
          {/* Tooltip for the hovered column: centered on it via translateX(-50%), pointer-events-none so it
              never steals the hover. At the extreme edge columns it can overhang the plot slightly —
              acceptable for v1. */}
          {hovered != null && (
            <div
              className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-ink-800 bg-ink-900 px-2 py-1.5 text-meta shadow-lg"
              style={{ left: `${((hovered + 0.5) / Math.max(n, 1)) * 100}%` }}
            >
              {renderTooltip(hovered)}
            </div>
          )}
        </div>
        {/* X-axis date labels (thinned by the caller). */}
        <div className="relative mt-1 h-3">
          {xLabels.map(({ index, label }) => (
            <span
              key={index}
              className="absolute -translate-x-1/2 text-micro tabular-nums text-fg-faint"
              style={{ left: `${((index + 0.5) / Math.max(n, 1)) * 100}%` }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Calendar cell geometry: a square cell and the gap to the next, in SVG/pixel units. Fixed (not stretched)
 *  so cells stay square; the container scrolls horizontally when too narrow rather than shrinking them. */
const CAL_CELL = 11;
const CAL_GAP = 3;
const CAL_STEP = CAL_CELL + CAL_GAP;

/** Mon/Wed/Fri weekday labels down the left of the grid (rows 1/3/5, Sunday = row 0). GitHub's convention. */
const CAL_WEEKDAYS: { row: number; label: string }[] = [
  { row: 1, label: "Mon" },
  { row: 3, label: "Wed" },
  { row: 5, label: "Fri" },
];

/** Fixed left-gutter width (px) holding the weekday labels, and the flex gap between it and the scroll area
 *  (Tailwind gap-2 = 8px) — together the grid's x offset inside the wrapper, so the tooltip (which lives in
 *  the non-scrolling wrapper) can line up over a cell. */
const CAL_GUTTER_W = 26;
const CAL_GAP_X = 8;
/** Height (px) of the month-label row above the grid (h-3.5 = 14 + mb-1 = 4), the grid's y offset. */
const CAL_MONTH_ROW_H = 18;

/**
 * A hand-rolled SVG contributions calendar (#115): one square cell per local day, laid out in week columns
 * (calendarGrid from contributions-geom), filled by the caller's `levelOf` against a ramp. Hovering a cell
 * shows the caller's tooltip (date + value); clicking calls `onSelectDay`; the page-selected day gets a ring.
 * Cells are fixed-size, so the plot scrolls horizontally inside its container when the column is too narrow
 * rather than shrinking. Month labels run along the top, weekday labels down the left.
 */
export function CalendarHeatmap({
  weeks,
  levelOf,
  colors,
  selectedDay,
  onSelectDay,
  renderTooltip,
  ariaLabelOf,
  monthLabels,
}: {
  weeks: CalendarCell[][];
  levelOf: (day: string) => number;
  colors: readonly string[];
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
  renderTooltip: (day: string) => ReactNode;
  ariaLabelOf: (day: string) => string;
  monthLabels: { col: number; label: string }[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // `x`/`y` are the hovered cell's position in the OUTER wrapper's coordinates (gutter + gap offset, minus the
  // scroll position baked in at hover time), so the tooltip — which lives in the non-scrolling wrapper, not
  // the clipping scroll area — can sit over the cell without being cut off at the grid's top edge.
  const [hovered, setHovered] = useState<{
    day: string;
    x: number;
    y: number;
  } | null>(null);
  const width = weeks.length * CAL_STEP;
  const height = 7 * CAL_STEP;

  // Open scrolled to the newest week (the grid runs oldest -> newest left to right), so the latest activity is
  // visible without scrolling. Keyed on the window's first/last day, so it snaps right only when the window
  // changes (page open, year switch) — NOT on the data-only polls that refresh cell colors, which would
  // otherwise fight a user who scrolled back to look at an earlier month.
  const firstDay = weeks[0]?.[0]?.day;
  const lastDay = weeks[weeks.length - 1]?.[6]?.day;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth; // clamps to the max automatically
  }, [firstDay, lastDay]);

  // Position the tooltip over a cell — shared by pointer hover and keyboard focus. The x is the cell's center
  // in the OUTER wrapper's coordinates, with the current scroll offset baked in at call time (see `hovered`).
  const showAt = (day: string, ci: number, ri: number): void =>
    setHovered({
      day,
      x:
        CAL_GUTTER_W +
        CAL_GAP_X +
        ci * CAL_STEP +
        CAL_CELL / 2 -
        (scrollRef.current?.scrollLeft ?? 0),
      y: ri * CAL_STEP,
    });
  const hideIf = (day: string): void =>
    setHovered((h) => (h?.day === day ? null : h));

  return (
    // Relative, non-clipping wrapper: the tooltip renders here, free to overhang the grid's top, while only
    // the inner div scrolls. (overflow-x-auto forces overflow-y to clip too, so a tooltip inside it would be
    // cut off for the top rows.)
    <div className="relative">
      <div className="flex gap-2">
        {/* Weekday labels: a fixed left gutter, dropped past the month-label row to align with the cell rows. */}
        <div
          className="relative shrink-0"
          style={{ width: CAL_GUTTER_W, height, marginTop: CAL_MONTH_ROW_H }}
        >
          {CAL_WEEKDAYS.map(({ row, label }) => (
            <span
              key={label}
              className="absolute right-0 text-micro text-fg-faint"
              style={{ top: row * CAL_STEP - 1 }}
            >
              {label}
            </span>
          ))}
        </div>
        {/* Scrolls horizontally when the grid is wider than the column. */}
        <div ref={scrollRef} className="min-w-0 overflow-x-auto">
          {/* Month labels above their column. */}
          <div className="relative mb-1 h-3.5" style={{ width }}>
            {monthLabels.map((m) => (
              <span
                key={`${m.col}-${m.label}`}
                className="absolute text-micro text-fg-faint"
                style={{ left: m.col * CAL_STEP }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <svg width={width} height={height} className="block">
            {weeks.map((col, ci) =>
              col.map((cell, ri) =>
                cell.inRange ? (
                  <rect
                    key={cell.day}
                    x={ci * CAL_STEP}
                    y={ri * CAL_STEP}
                    width={CAL_CELL}
                    height={CAL_CELL}
                    rx={2}
                    fill={colors[levelOf(cell.day)] ?? colors[0]}
                    stroke="var(--color-fg)"
                    strokeWidth={cell.day === selectedDay ? 1.5 : 0}
                    className="cursor-pointer"
                    // A focusable, labeled button so the click-to-filter is reachable by keyboard and announced
                    // to screen readers; Enter/Space drill in, focus mirrors hover to surface the tooltip.
                    tabIndex={0}
                    role="button"
                    aria-label={ariaLabelOf(cell.day)}
                    onMouseEnter={() => showAt(cell.day, ci, ri)}
                    onMouseLeave={() => hideIf(cell.day)}
                    onFocus={() => showAt(cell.day, ci, ri)}
                    onBlur={() => hideIf(cell.day)}
                    onClick={() => onSelectDay(cell.day)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectDay(cell.day);
                      }
                    }}
                  />
                ) : null,
              ),
            )}
          </svg>
        </div>
      </div>
      {/* Tooltip for the hovered cell, anchored just above it in the wrapper's coordinates; pointer-events-none
          so it never steals the hover. -translate-y-full lifts its own height so its bottom edge sits over the
          cell top; at the top rows it overhangs the wrapper (uncut), like BarSeries' tooltip. */}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-ink-800 bg-ink-900 px-2 py-1.5 text-meta shadow-lg"
          style={{ left: hovered.x, top: CAL_MONTH_ROW_H + hovered.y - 4 }}
        >
          {renderTooltip(hovered.day)}
        </div>
      )}
    </div>
  );
}
