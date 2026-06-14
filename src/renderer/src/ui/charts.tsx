import { useState, type ReactNode } from "react";
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
          {/* Tooltip for the hovered column, centered over it, clamped to stay on-screen by the caller's
              content width; translateX(-50%) centers it on the column. */}
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
