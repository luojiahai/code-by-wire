import { type CSSProperties, type ReactNode } from "react";
import {
  type DailyBucket,
  type StatsByModel,
  type StatsRange,
  rangeWindow,
  localDayKey,
  densifyDays,
} from "@shared/stats";
import {
  formatTokensShort,
  formatTokensAxis,
  formatDayLong,
} from "@shared/format";
import { modelColorOf } from "../ui/meta";
import { Swatch } from "../ui/atoms";
import { StatsCard, CardRegion } from "./shared";
import { ComposedChart } from "../ui/bklit/charts/composed-chart";
import { SeriesBar } from "../ui/bklit/charts/series-bar";
import { Line } from "../ui/bklit/charts/line";
import { Grid } from "../ui/bklit/charts/grid";
import { XAxis } from "../ui/bklit/charts/x-axis";
import { YAxis } from "../ui/bklit/charts/y-axis";
import { ChartTooltip } from "../ui/bklit/charts/tooltip";
import { RingChart } from "../ui/bklit/charts/ring-chart";
import { Ring } from "../ui/bklit/charts/ring";
import { RingCenter } from "../ui/bklit/charts/ring-center";
import {
  chartCenterLabelClassName,
  chartCenterValueClassName,
} from "../ui/bklit/charts/chart-center-typography";

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
  const hasChart = daily.length > 0;
  const hasList = byModel.some((r) => r.totalTokens > 0);
  if (!hasChart && !hasList) return null;
  return (
    <StatsCard>
      <CardRegion title="Tokens per day">
        {hasChart && (
          <TokensPerDay daily={daily} byModel={byModel} range={range} />
        )}
        {hasList && (
          // The share ring and the breakdown list read as one unit: the ring's slices and the list's
          // swatches carry the same identity colors, so the list doubles as the ring's legend. Side by
          // side on the roomy desktop card; stacked (ring centered on top) once the window narrows.
          <div
            className={`flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8 ${hasChart ? "mt-6" : ""}`}
          >
            <ModelShareRing rows={byModel} />
            <ByModelList rows={byModel} className="w-full flex-1" />
          </div>
        )}
      </CardRegion>
    </StatsCard>
  );
}

/** 'YYYY-MM-DD' → a local-midnight Date, the x value the Bklit time scale expects. */
function dayToDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The daily usage time-series (#114, revised again): a Bklit ComposedChart — one model-stacked bar
 * per local calendar day (densified across the range, series in byModel store order, identity
 * colors) plus a turns/day line on its own right-hand scale, so cost (tokens) and activity
 * (back-and-forth) read together. Reveal/tooltip animation comes from the vendored chart runtime.
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
    .map((r) => ({
      modelRaw: r.modelRaw,
      key: modelKey(r.modelRaw),
      color: modelColorOf(r.modelRaw),
    }))
    .filter((s) => presentModels.has(s.key));

  // One row per day: the x date, the turns line, and a column per model (zero-filled so the
  // stack never sees undefined).
  const rows = days.map((d) => {
    const row: Record<string, unknown> = {
      date: dayToDate(d.day),
      day: d.day,
      turns: d.turns,
    };
    for (const s of series) row[s.key] = 0;
    for (const e of d.byModel) row[modelKey(e.modelRaw)] = e.totalTokens;
    return row;
  });

  const renderTooltip = ({
    point,
  }: {
    point: Record<string, unknown>;
  }): ReactNode => {
    const modelRows = series
      .map((s) => ({
        label: s.modelRaw ?? "Unknown",
        value: typeof point[s.key] === "number" ? (point[s.key] as number) : 0,
        color: s.color,
      }))
      .filter((r) => r.value > 0);
    const total = modelRows.reduce((sum, r) => sum + r.value, 0);
    const turns = typeof point.turns === "number" ? point.turns : 0;
    return (
      // Custom tooltip content renders raw inside the box (the default TooltipContent's px-3
      // py-2.5 doesn't apply), so it carries its own padding.
      <div className="flex flex-col gap-1 px-3.5 py-3 text-meta">
        <div className="font-medium text-fg">
          {formatDayLong(point.day as string)}
        </div>
        {modelRows.length === 0 ? (
          <div className="text-fg-faint">No usage</div>
        ) : (
          modelRows.map((r) => (
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
          <span className="text-fg-muted">Total</span>
          <span className="ml-auto pl-3 font-mono tabular-nums text-fg">
            {formatTokensShort(total)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-fg-muted">Turns</span>
          <span className="ml-auto pl-3 font-mono tabular-nums text-fg">
            {turns}
          </span>
        </div>
      </div>
    );
  };

  return (
    <ComposedChart
      data={rows}
      stacked
      maxBarSize={26}
      aspectRatio="3 / 1"
      margin={{ top: 16, right: 48, bottom: 32, left: 48 }}
      className="text-meta"
    >
      <Grid horizontal />
      {series.map((s) => (
        <SeriesBar key={s.key} dataKey={s.key} fill={s.color} radius={2} />
      ))}
      <Line
        dataKey="turns"
        yAxisId="turns"
        stroke="var(--chart-line-secondary)"
        strokeWidth={2}
      />
      <XAxis numTicks={6} />
      <YAxis formatValue={formatTokensAxis} />
      <YAxis yAxisId="turns" orientation="right" />
      {/* No per-series dots (they float mid-bar — bars register as zero-width lines for hover
          tracking) and no date pill (it overlaps the bar's base; the content shows the date). */}
      <ChartTooltip
        content={renderTooltip}
        showDots={false}
        showDatePill={false}
      />
    </ComposedChart>
  );
}

/**
 * The model-share ring: a Bklit RingChart rendered as concentric arcs — one ring per model, each filled to
 * that model's share of the window's total tokens (value = its tokens, maxValue = the total), in the
 * model's identity color (modelColorOf — the same hue as its ByModelList swatch), with the total token
 * count animating in the center. Sits beside the breakdown list, which is its legend.
 *
 * Theming: the unfilled track reads `var(--border)`, a token this app doesn't define (its Bklit bridge
 * stops short of it), so the wrapper bridges `--border` to the theme-aware hairline `--color-ink-800` —
 * the very track the rate-limit gauges use — scoped to this subtree. Slice colors route through the same
 * --color-model-* variables as the swatches, so the ring follows the light (monochrome) and dark (jewel)
 * branches automatically. Fixed 168px (the LiveLine-style inline-height override isn't needed — RingChart
 * takes a real `size` prop).
 */
function ModelShareRing({ rows }: { rows: StatsByModel[] }) {
  const total = rows.reduce((s, r) => s + r.totalTokens, 0);
  const models = rows
    .filter((r) => r.totalTokens > 0)
    .sort(
      (a, b) =>
        b.totalTokens - a.totalTokens ||
        (a.modelRaw ?? "").localeCompare(b.modelRaw ?? ""),
    );
  if (total <= 0 || models.length === 0) return null;

  const data = models.map((r) => ({
    label: r.modelRaw ?? "Unknown",
    value: r.totalTokens,
    maxValue: total,
    color: modelColorOf(r.modelRaw),
  }));

  return (
    <div
      className="shrink-0"
      style={{ "--border": "var(--color-ink-800)" } as CSSProperties}
    >
      <RingChart
        data={data}
        size={168}
        strokeWidth={10}
        ringGap={6}
        baseInnerRadius={46}
      >
        {data.map((d, i) => (
          <Ring key={d.label} index={i} />
        ))}
        <RingCenter
          defaultLabel="Tokens"
          formatOptions={{
            notation: "compact",
            compactDisplay: "short",
            maximumFractionDigits: 1,
          }}
          valueClassName={`${chartCenterValueClassName} text-fg`}
          labelClassName={`${chartCenterLabelClassName} text-fg-faint`}
        />
      </RingChart>
    </div>
  );
}

/**
 * The per-model breakdown (#111, redesigned): a two-column list — swatch, mono raw id, share % of the
 * window's total tokens, and a dimmed In/Out line of fresh input/output figures. It sits beside the share
 * ring in the same "Tokens per day" region, so its swatches double as the ring's color key (there is no
 * separate legend). Every model is listed (the model set is small, no cap needed). `className` carries the
 * flex sizing from the ring/list row.
 */
function ByModelList({
  rows,
  className = "",
}: {
  rows: StatsByModel[];
  className?: string;
}) {
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
      className={`grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 ${className}`}
    >
      {/* NUL sentinel key: a real raw id can never collide with the null "Unknown" bucket. */}
      {ranked.map((r) => (
        <div key={r.modelRaw ?? "\u0000"} className="min-w-0">
          <div className="flex items-center gap-2">
            <Swatch color={modelColorOf(r.modelRaw)} />
            <span className="truncate font-mono text-aux text-fg">
              {r.modelRaw ?? "Unknown"}
            </span>
            <span className="font-mono text-meta tabular-nums text-fg-faint">
              {total > 0
                ? `${((r.totalTokens / total) * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
          <div className="mt-0.5 pl-4 font-mono text-meta tabular-nums text-fg-faint">
            In: {formatTokensShort(r.inputTokens)} · Out:{" "}
            {formatTokensShort(r.outputTokens)}
          </div>
        </div>
      ))}
    </div>
  );
}
