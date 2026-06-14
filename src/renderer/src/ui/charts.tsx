import { useRef, useState, type ReactNode } from "react";
import { cx } from "./atoms";
import {
  donutGradient,
  ringGradient,
  segmentPercents,
  niceAxisMax,
  axisTicks,
  stackBands,
  type Segment,
} from "./charts-geom";
import type { CalendarCell } from "./contributions-geom";

// The default ring/donut track and the center hole. The mask punches a transparent core into the
// conic ring; the centered children sit in a separate, unmasked layer.
const TRACK = "var(--color-ink-850)";
const HOLE = "radial-gradient(farthest-side, transparent 62%, #000 63%)";

/** A masked conic circle. `gradient` is a ready conic-gradient string; children overlay the center. */
function Gauge({
  gradient,
  size,
  children,
}: {
  gradient: string;
  size: number;
  children?: ReactNode;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          backgroundImage: gradient,
          WebkitMaskImage: HOLE,
          maskImage: HOLE,
        }}
      />
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A progress ring filling toward a ceiling. `fill` is a CSS color (e.g. ctxColor(pct)). */
export function Ring({
  pct,
  fill,
  size = 88,
  track = TRACK,
  children,
}: {
  pct: number;
  fill: string;
  size?: number;
  track?: string;
  children?: ReactNode;
}) {
  return (
    <Gauge gradient={ringGradient(pct, fill, track)} size={size}>
      {children}
    </Gauge>
  );
}

/** A composition donut. Segment order is the legend order. */
export function Donut({
  segments,
  size = 74,
  track = TRACK,
  children,
}: {
  segments: Segment[];
  size?: number;
  track?: string;
  children?: ReactNode;
}) {
  return (
    <Gauge gradient={donutGradient(segments, track)} size={size}>
      {children}
    </Gauge>
  );
}

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
 *  0..100 fill (the caller derives it via ratePct against the reference rate); we clamp defensively. */
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
      <span className="w-12 shrink-0 text-[12px] text-fg-muted">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-850">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            background: color,
          }}
        />
      </span>
      <span className="w-[52px] shrink-0 text-right font-mono text-[12px] tabular-nums text-fg">
        {value}
      </span>
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

  return (
    <div className="flex gap-2">
      {/* Y-axis labels, bottom-aligned to their tick fraction. */}
      <div className="relative h-40 w-12 shrink-0">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-0 -translate-y-1/2 text-[9px] tabular-nums text-fg-faint"
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
              className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-ink-800 bg-ink-900 px-2 py-1.5 text-[11px] shadow-lg"
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
              className="absolute -translate-x-1/2 text-[9px] tabular-nums text-fg-faint"
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
  monthLabels,
}: {
  weeks: CalendarCell[][];
  levelOf: (day: string) => number;
  colors: readonly string[];
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
  renderTooltip: (day: string) => ReactNode;
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
              className="absolute right-0 text-[9px] text-fg-faint"
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
                className="absolute text-[9px] text-fg-faint"
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
                    onMouseEnter={() =>
                      setHovered({
                        day: cell.day,
                        x:
                          CAL_GUTTER_W +
                          CAL_GAP_X +
                          ci * CAL_STEP +
                          CAL_CELL / 2 -
                          (scrollRef.current?.scrollLeft ?? 0),
                        y: ri * CAL_STEP,
                      })
                    }
                    onMouseLeave={() =>
                      setHovered((h) => (h?.day === cell.day ? null : h))
                    }
                    onClick={() => onSelectDay(cell.day)}
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
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-ink-800 bg-ink-900 px-2 py-1.5 text-[11px] shadow-lg"
          style={{ left: hovered.x, top: CAL_MONTH_ROW_H + hovered.y - 4 }}
        >
          {renderTooltip(hovered.day)}
        </div>
      )}
    </div>
  );
}
