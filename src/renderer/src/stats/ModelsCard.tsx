import { type ReactNode } from "react";
import {
  type DailyBucket,
  type StatsByModel,
  type StatsRange,
  rangeWindow,
  localDayKey,
  densifyDays,
} from "@shared/stats";
import { formatTokensShort, formatTokensAxis } from "@shared/format";
import { useI18n } from "../i18n";
import { BarSeries, type DayColumn } from "../ui/charts";
import { modelColorOf } from "../ui/meta";
import { Swatch } from "../ui/atoms";
import { StatsCard, CardRegion } from "./shared";

/** The Map key for the null ("Unknown") model — a single space can't be a real model id. */
const NULL_MODEL_KEY = " ";
const modelKey = (raw: string | null): string => raw ?? NULL_MODEL_KEY;

/**
 * Card 2 (#spec 2026-07-03): the daily time-series with the per-model breakdown merged into the same
 * "Tokens per day" region below it. The chart is ALWAYS stacked by model (the Kind/Model toggle and
 * by-kind stacking are retired); it carries no separate legend — the breakdown list's swatches are the
 * color key. Chart and list both work in full totals (all four token kinds).
 */
export function ModelsCard({
  daily,
  byModel,
  range,
}: {
  daily: DailyBucket[];
  byModel: StatsByModel[];
  range: StatsRange;
}) {
  const { t } = useI18n();
  const hasChart = daily.length > 0;
  const hasList = byModel.some((r) => r.totalTokens > 0);
  if (!hasChart && !hasList) return null;
  return (
    <StatsCard>
      <CardRegion title={t.stats.models.title}>
        {hasChart && (
          <TokensPerDay daily={daily} byModel={byModel} range={range} />
        )}
        {hasList && <ByModelList rows={byModel} spaced={hasChart} />}
      </CardRegion>
    </StatsCard>
  );
}

/**
 * The daily usage time-series (#114, revised): one model-stacked SVG bar per local calendar day across
 * the active range. Densification, axis labeling, series order (byModel store order), and identity
 * colors are unchanged from the old DailyUsage; only the kind stacking is gone.
 */
function TokensPerDay({
  daily,
  byModel,
  range,
}: {
  daily: DailyBucket[];
  byModel: StatsByModel[];
  range: StatsRange;
}) {
  const { t } = useI18n();
  // Contiguous calendar axis for the active window (see rangeWindow) — recomputed per render off
  // Date.now(); a midnight tick self-corrects.
  const now = Date.now();
  const { sinceMs, untilMs } = rangeWindow(range, now);
  const endDay = untilMs != null ? localDayKey(untilMs - 1) : localDayKey(now);
  const startDay =
    sinceMs != null ? localDayKey(sinceMs) : (daily[0]?.day ?? endDay);
  const days = densifyDays(daily, startDay, endDay);

  // Model series in store order (tokens desc), dropping any model that never lands on a rendered day
  // (its stack band would be all-zero across the range).
  const presentModels = new Set<string>();
  for (const d of days)
    for (const e of d.byModel) presentModels.add(modelKey(e.modelRaw));
  const series = byModel
    .map((r) => ({ modelRaw: r.modelRaw, color: modelColorOf(r.modelRaw) }))
    .filter((s) => presentModels.has(modelKey(s.modelRaw)));

  const perDayModel = days.map((d) => {
    const m = new Map<string, number>();
    for (const e of d.byModel) m.set(modelKey(e.modelRaw), e.totalTokens);
    return m;
  });

  const columns: DayColumn[] = days.map((d, i) => ({
    key: d.day,
    segments: series.map((s) => ({
      value: perDayModel[i].get(modelKey(s.modelRaw)) ?? 0,
      color: s.color,
    })),
  }));

  // Thin the x labels to ~8, anchored on the last (newest) day.
  const stride = Math.max(1, Math.ceil(days.length / 8));
  const lastPhase = (days.length - 1) % stride;
  const xLabels = days
    .map((d, i) => ({ index: i, label: t.time.dayShort(d.day) }))
    .filter(({ index }) => index % stride === lastPhase);

  const renderTooltip = (i: number): ReactNode => {
    const d = days[i];
    const rows = series
      .map((s) => ({
        label: s.modelRaw ?? t.stats.shared.unknownModel,
        value: perDayModel[i].get(modelKey(s.modelRaw)) ?? 0,
        color: s.color,
      }))
      .filter((r) => r.value > 0);
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    return (
      <div className="flex flex-col gap-1">
        <div className="font-medium text-fg">{t.time.dayLong(d.day)}</div>
        {rows.length === 0 ? (
          <div className="text-fg-faint">{t.stats.models.tooltipNoUsage}</div>
        ) : (
          rows.map((r) => (
            <div key={r.label} className="flex items-center gap-1.5">
              <Swatch color={r.color} />
              <span className="text-fg-muted">{r.label}</span>
              <span className="ml-auto pl-3 font-mono tabular-nums text-fg">
                {formatTokensShort(r.value)}
              </span>
            </div>
          ))
        )}
        <div className="mt-0.5 flex items-center gap-1.5 border-t border-ink-800 pt-1">
          <span className="text-fg-muted">{t.stats.models.total}</span>
          <span className="ml-auto pl-3 font-mono tabular-nums text-fg">
            {formatTokensShort(total)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <BarSeries
      columns={columns}
      formatTick={formatTokensAxis}
      xLabels={xLabels}
      renderTooltip={renderTooltip}
    />
  );
}

/**
 * The per-model breakdown (#111, redesigned): a two-column list — swatch, mono raw id, share % of the
 * window's total tokens, and a dimmed In/Out line of fresh input/output figures. It sits directly under
 * the daily chart in the same "Tokens per day" region, so its swatches double as the chart's color key
 * (there is no separate legend). Every model is listed (the model set is small, no cap needed). `spaced`
 * adds top margin when it follows the chart.
 */
function ByModelList({
  rows,
  spaced,
}: {
  rows: StatsByModel[];
  spaced: boolean;
}) {
  const { t } = useI18n();
  const total = rows.reduce((s, r) => s + r.totalTokens, 0);
  const ranked = rows
    .slice()
    .sort(
      (a, b) =>
        b.totalTokens - a.totalTokens ||
        (a.modelRaw ?? "").localeCompare(b.modelRaw ?? ""),
    );
  return (
    <div
      className={`grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 ${spaced ? "mt-6" : ""}`}
    >
      {/* NUL sentinel key: a real raw id can never collide with the null "Unknown" bucket. */}
      {ranked.map((r) => (
        <div key={r.modelRaw ?? "\u0000"} className="min-w-0">
          <div className="flex items-center gap-2">
            <Swatch color={modelColorOf(r.modelRaw)} />
            <span className="truncate font-mono text-aux text-fg">
              {r.modelRaw ?? t.stats.shared.unknownModel}
            </span>
            <span className="font-mono text-meta tabular-nums text-fg-faint">
              {total > 0
                ? `${((r.totalTokens / total) * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
          <div className="mt-0.5 pl-4 font-mono text-meta tabular-nums text-fg-faint">
            {t.stats.models.inOut(
              formatTokensShort(r.inputTokens),
              formatTokensShort(r.outputTokens),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
