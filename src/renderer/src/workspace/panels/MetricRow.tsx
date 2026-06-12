import type { ReactNode } from "react";
import { cx, Swatch } from "../../ui/atoms";

/** One dense metric row: label left, value right (mono, tabular). A null/undefined value renders a muted
 *  em-dash so the row position stays stable (the empty-state rule). `tone` is an optional Tailwind text
 *  class for the value (e.g. ctxTone / text-accent-bright). `swatch` is an optional CSS color that draws
 *  a small square before the label — used by the cost/token legends so the row keys to a diagram color. */
export function MetricRow({
  label,
  value,
  tone,
  title,
  swatch,
}: {
  label: string;
  value: ReactNode | null | undefined;
  tone?: string;
  title?: string;
  swatch?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div
      className="flex items-baseline justify-between gap-3 py-0.5"
      title={title}
    >
      <span className="flex items-center gap-1.5 text-[12px] text-fg-muted">
        {swatch && <Swatch color={swatch} />}
        {label}
      </span>
      <span
        className={cx(
          "font-mono text-[12px] tabular-nums",
          empty ? "text-ink-600" : (tone ?? "text-fg"),
        )}
      >
        {empty ? "—" : value}
      </span>
    </div>
  );
}
