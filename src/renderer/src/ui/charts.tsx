import type { ReactNode } from "react";
import { cx } from "./atoms";
import {
  donutGradient,
  ringGradient,
  segmentPercents,
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
