import type { ReactNode } from "react";
import { type StatsRange, type RangePreset } from "@shared/stats";
import { useI18n } from "../i18n";

/** The merged-card shell (#spec 2026-07-03 Visual language): one border, ink-925 surface — the
 *  page-primitives Card treatment without its mandatory title strip. Deliberately NOT overflow-clipped:
 *  the daily-chart and contributions-calendar tooltips inside are designed to overhang the card edge,
 *  and an `overflow-hidden` here would cut them off at the plot's left/right edge. Nothing in the card
 *  needs corner clipping — its content is either transparent (the flush KPI tile grid) or inset by
 *  CardRegion padding. Regions inside divide with CardDivider. */
export function StatsCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-800 bg-ink-925">
      {children}
    </section>
  );
}

/** The full-width hairline between two regions of a StatsCard (the Settings-card row divider). */
export function CardDivider() {
  return <div aria-hidden className="h-px bg-ink-850" />;
}

/** One padded region of a StatsCard: an overline title left, optional controls right, over the
 *  region's content — the old bordered-panel header, minus the border, which the enclosing
 *  StatsCard now draws once for the whole card. */
export function CardRegion({
  title,
  right,
  children,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-4">
      {(title != null || right != null) && (
        <header className="mb-4 flex items-center justify-between gap-2">
          {title != null && (
            <h2 className="font-display text-label font-semibold uppercase tracking-[0.1em] text-fg-faint">
              {title}
            </h2>
          )}
          {right}
        </header>
      )}
      {children}
    </div>
  );
}

/** One KPI tile: an uppercase eyebrow over a mono value. Every tile shares ONE value size so the 4×2
 *  grid reads evenly (numbers and strings alike). The value truncates — with an optional `title`
 *  tooltip — so a long string like a raw model id can't stretch its column or wrap to a second line;
 *  `min-w-0` lets the grid cell shrink so the truncation actually engages. Callers dim unit suffixes
 *  inline (<span className="text-fg-faint">). The grid owner passes the cell hairlines via className. */
export function KpiTile({
  label,
  title,
  className = "",
  children,
}: {
  label: string;
  /** Hover tooltip for the value — set it where the value can be a long string that truncates
   *  (e.g. a raw model id), so the full text stays reachable. */
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col px-4 py-3.5 ${className}`}>
      <div className="font-display text-micro font-semibold uppercase tracking-[0.1em] text-fg-faint">
        {label}
      </div>
      <div
        title={title}
        className="mt-1.5 truncate font-mono text-title font-medium leading-tight tracking-tight tabular-nums text-fg"
      >
        {children}
      </div>
    </div>
  );
}

/** The page-global range filter: five trailing windows (Today/7d/30d/90d/All), defaulting to 30d,
 *  scoping every total on the page (not the calendar, which is range-independent). Labels resolve
 *  from the live catalog inside the component (never at module scope) so a locale switch relabels
 *  the chips immediately. */
export function RangeFilter({
  value,
  onChange,
}: {
  value: StatsRange;
  onChange: (r: StatsRange) => void;
}) {
  const { t } = useI18n();
  const rangeLabels = {
    today: t.stats.shared.rangeToday,
    "7d": t.stats.shared.range7d,
    "30d": t.stats.shared.range30d,
    "90d": t.stats.shared.range90d,
    all: t.stats.shared.rangeAll,
  } satisfies Record<RangePreset, string>;
  const rangeOpts = Object.entries(rangeLabels) as [RangePreset, string][];
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-ink-800 bg-ink-900 p-0.5 text-meta">
      {rangeOpts.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={v === value}
          className={`rounded-sm px-2 py-0.5 transition-colors ${
            v === value
              ? "bg-ink-700 text-fg"
              : "text-fg-faint hover:text-fg-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
