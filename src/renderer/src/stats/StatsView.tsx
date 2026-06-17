import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { OverlayScroll } from "../ui/OverlayScroll";
import {
  type StatsSnapshot,
  type ScanProgress,
  type StatsTotals,
  type StatsByModel,
  type StatsByProject,
  type StatsByBranch,
  type StatsBySession,
  type StatsRange,
  type RangePreset,
  type DailyBucket,
  type CalendarDay,
  DEFAULT_RANGE,
  emptySnapshot,
  branchRowKey,
  tokensOf,
  isDayRange,
  rangeWindow,
  localDayKey,
  densifyDays,
} from "@shared/stats";
import {
  formatTokensShort,
  formatUsd,
  formatDuration,
  formatRelativeTime,
  formatDayShort,
  formatDayLong,
  formatMonthShort,
} from "@shared/format";
import { Icon } from "../ui/icons";
import {
  Donut,
  BarSeries,
  CalendarHeatmap,
  StackedBar,
  type DayColumn,
} from "../ui/charts";
import {
  MODEL_SEGMENT_COLORS,
  COST_SEGMENT_COLORS,
  CALENDAR_RAMP,
} from "../ui/meta";
import {
  calendarGrid,
  intensityThresholds,
  intensityLevel,
  monthLabelCols,
} from "../ui/contributions-geom";
import { Swatch, Bar } from "../ui/atoms";
import { InfoButton } from "../ui/InfoButton";
import {
  sortSessions,
  defaultDirFor,
  DEFAULT_SESSION_SORT,
  type SessionSort,
  type SessionSortKey,
} from "./session-sort";
import { groupProjectBranches, TOP_PROJECTS } from "./project-branches";

/** Poll cadences: brisk while the first cold backfill fills in, gentle once caught up so a turn landing
 *  in another Session still shows up without a manual refresh. */
const BACKFILL_POLL_MS = 40;
const WARM_POLL_MS = 1500;

/**
 * The Overall Stats view: a headline KPI strip, then the contributions calendar, the daily time-series,
 * and the per-model / per-project / per-Session breakdowns, with a "building history" progress banner on a
 * first cold run. Polls stats:read while mounted — each poll runs one bounded scan step in the main
 * process — fast until the backfill is done, then at the warm cadence so turns from other Sessions appear
 * on their own. The effect's cleanup stops the poll on unmount, so selecting any Session ends all scan
 * work; the main process does nothing unprompted.
 */
export function StatsView() {
  const [snap, setSnap] = useState<StatsSnapshot | null>(null);
  const [range, setRange] = useState<StatsRange>(DEFAULT_RANGE);
  const [includeCache, setIncludeCache] = useState(true);
  // The calendar's window selector: null = trailing twelve months, a number = that local year. Independent
  // of `range` — it drives only the calendar query, not the page totals.
  const [calendarYear, setCalendarYear] = useState<number | null>(null);
  // The calendar's intensity metric. Page-local; all three metrics ride each CalendarDay, so switching is a
  // pure re-bucket with no re-fetch.
  const [calMetric, setCalMetric] = useState<CalMetric>("turns");

  // The last change token from stats:read, echoed back as `since`. Reset on a range/year change so a filter
  // switch always forces a full snapshot.
  const tokenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    tokenRef.current = undefined; // new range/year: force a full snapshot on the next poll
    // Range changed: blank the cards back to loading rather than show the prior range's totals under the
    // newly-pressed button. But NOT when drilling into a day from the calendar — blanking would unmount the
    // calendar and re-fire its scroll-to-newest effect, flashing away from the clicked cell.
    if (!isDayRange(range)) setSnap(null);

    const schedule = (ms: number): void => {
      timer = setTimeout(tick, ms);
    };
    function tick(): void {
      if (inFlight) return; // a slow read is outstanding; its handler will reschedule
      if (document.hidden) {
        // Backgrounded: don't fetch (and don't drive the main-thread walk). Re-check at the warm cadence;
        // returning to the foreground fires an immediate tick via the listener below.
        schedule(WARM_POLL_MS);
        return;
      }
      inFlight = true;
      void window.api
        .readStats(range, calendarYear ?? undefined, tokenRef.current)
        .then((r) => {
          if (!alive) return;
          inFlight = false;
          tokenRef.current = r.token;
          // unchanged: hold the current snapshot (no setSnap -> no re-render). It implies the backfill is
          // done, so reschedule at the warm cadence; a changed snapshot carries its own progress.
          const done =
            r.status === "unchanged" ? true : r.snapshot.progress.done;
          if (r.status === "changed") setSnap(r.snapshot);
          schedule(done ? WARM_POLL_MS : BACKFILL_POLL_MS);
        })
        .catch(() => {
          // The handler is built never to reject; reaching here means the IPC bridge itself failed. Keep the
          // last good snapshot (fall back to an empty done snapshot only on the very first poll) and retry warm.
          if (!alive) return;
          inFlight = false;
          setSnap((prev) => prev ?? emptySnapshot());
          schedule(WARM_POLL_MS);
        });
    }

    const onVisible = (): void => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [range, calendarYear]);

  return (
    <OverlayScroll className="h-full min-w-0 flex-1 bg-ink-950 text-fg">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-lg text-fg">Overall stats</h1>
          <div className="flex items-center gap-2">
            {isDayRange(range) && (
              <button
                type="button"
                onClick={() => setRange(DEFAULT_RANGE)}
                title="Clear the day filter"
                className="flex items-center gap-1 rounded-md border border-ink-700 bg-ink-700 px-2 py-0.5 text-[11px] text-fg transition-colors hover:bg-ink-600"
              >
                {formatDayShort(range.day)}
                <span aria-hidden className="text-fg-muted">
                  ×
                </span>
              </button>
            )}
            <CacheToggle on={includeCache} onChange={setIncludeCache} />
            <RangeFilter value={range} onChange={setRange} />
          </div>
        </header>
        {/* null = first poll in flight: blank below the header (matches EmptyDetail's loading). */}
        {snap && (
          <>
            {!snap.progress.done && (
              <BuildingHistory progress={snap.progress} />
            )}
            {/* "No usage yet" only when the store is empty AND the scoped totals are too. The second
                clause is the safety: hasAnyTurns rides a separate query (safeHasAnyTurns → false on a read
                error), so a non-zero scoped count must still win, never EmptyStats over real cards. In the
                normal case totals.turns is 0 whenever hasAnyTurns is false, so this is a no-op. */}
            {!snap.hasAnyTurns &&
            snap.totals.turns === 0 &&
            snap.progress.done ? (
              <EmptyStats />
            ) : (
              <>
                <KpiStrip totals={snap.totals} includeCache={includeCache} />
                {snap.calendarStart && (
                  <Contributions
                    days={snap.calendar}
                    startDay={snap.calendarStart}
                    endDay={snap.calendarEnd}
                    years={snap.calendarYears}
                    year={calendarYear}
                    onYear={setCalendarYear}
                    metric={calMetric}
                    onMetric={setCalMetric}
                    includeCache={includeCache}
                    selectedDay={isDayRange(range) ? range.day : null}
                    onSelectDay={(day) => setRange({ day })}
                  />
                )}
                {snap.daily.length > 0 && (
                  <DailyUsage
                    daily={snap.daily}
                    byModel={snap.byModel}
                    range={range}
                  />
                )}
                {(snap.byModel.length > 0 || snap.byProject.length > 0) && (
                  <div
                    className={`grid grid-cols-1 gap-4 ${
                      snap.byModel.length > 0 && snap.byProject.length > 0
                        ? "lg:grid-cols-2"
                        : ""
                    }`}
                  >
                    {snap.byModel.length > 0 && (
                      <ByModel
                        rows={snap.byModel}
                        includeCache={includeCache}
                      />
                    )}
                    {snap.byProject.length > 0 && (
                      <ByProject
                        rows={snap.byProject}
                        branches={snap.byBranch}
                        includeCache={includeCache}
                      />
                    )}
                  </div>
                )}
                {snap.bySession.length > 0 && (
                  <BySession
                    rows={snap.bySession}
                    includeCache={includeCache}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </OverlayScroll>
  );
}

/** The first-cold-run progress state (#107 user story 26): a thin determinate bar while the scan ingests
 *  history. Gone once progress.done — the warm polls that follow refresh the totals silently. */
function BuildingHistory({ progress }: { progress: ScanProgress }) {
  const pct = progress.filesTotal
    ? Math.round((progress.filesDone / progress.filesTotal) * 100)
    : 0;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-ink-800 bg-ink-900/40 px-3 py-2.5">
      <div className="flex items-center justify-between text-[11px] text-fg-muted">
        <span>Building history…</span>
        <span className="tabular-nums">
          {progress.filesDone.toLocaleString("en-US")}/
          {progress.filesTotal.toLocaleString("en-US")}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** The page-global range filter (#110): five trailing windows, defaulting to 30d. It scopes every total
 *  on the page (not the calendar, which is range-independent — that's why it sits in the page header, not a
 *  panel). Presentational; the scoping happens main-side via the range passed through stats:read.
 *  `satisfies Record<RangePreset, string>` keeps this list exhaustive: a new preset can't ship a main-side
 *  bound without also growing a button here, the way RANGE_DAYS enforces it for the bound. (The single-day
 *  `{ day }` range isn't a preset, so it's deliberately absent — it has no button.) */
const RANGE_LABELS = {
  today: "Today",
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  all: "All",
} satisfies Record<RangePreset, string>;

// Insertion order is the render order (none of the keys are array-index-like), and the cast restores the
// RangePreset key type that Object.entries widens to string.
const RANGE_OPTS = Object.entries(RANGE_LABELS) as [RangePreset, string][];

function RangeFilter({
  value,
  onChange,
}: {
  value: StatsRange;
  onChange: (r: StatsRange) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-ink-800 bg-ink-900 p-0.5 text-[11px]">
      {RANGE_OPTS.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={v === value}
          className={`rounded px-2 py-0.5 transition-colors ${
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

/** Which metric the calendar's cell intensity reads. All three ride each CalendarDay, so the toggle is a
 *  pure re-bucket — no re-fetch. Default is turns (#115). */
type CalMetric = "turns" | "tokens" | "equiv";

const CAL_METRIC_LABELS: Record<CalMetric, string> = {
  turns: "Turns",
  tokens: "Tokens",
  equiv: "Equiv API value",
};
const CAL_METRIC_OPTS = Object.entries(CAL_METRIC_LABELS) as [
  CalMetric,
  string,
][];

/**
 * The contributions calendar (#115): a full-width activity grid below the KPI strip. A trailing-twelve-month (or selected-year) grid of
 * one cell per local day, intensity-bucketed adaptively over the visible window by the active metric (turns
 * default, tokens, or Equivalent API value). Its window is queried independently of the page range filter, so
 * its year switcher and metric toggle live in this panel's header, not the page toolbar. Hovering a day shows
 * the date and that day's value; clicking a day drives the page range to that single date (the rest of the
 * page re-scopes; the calendar stays put, the clicked cell ringed).
 */
function Contributions({
  days,
  startDay,
  endDay,
  years,
  year,
  onYear,
  metric,
  onMetric,
  includeCache,
  selectedDay,
  onSelectDay,
}: {
  days: CalendarDay[];
  startDay: string;
  endDay: string;
  years: number[];
  year: number | null;
  onYear: (y: number | null) => void;
  metric: CalMetric;
  onMetric: (m: CalMetric) => void;
  includeCache: boolean;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  // Derived grid/metrics, memoized so the calendar isn't rebuilt wholesale on every poll re-render. weeks and
  // monthLabels key on the day-string bounds (stable by value across polls, so the ~370-cell grid build and
  // the column scan skip when the window is unchanged); the value buckets additionally track the active metric
  // and cache pill, so a toggle only re-buckets rather than re-laying-out.
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  // The value a day contributes under the active metric. The Tokens metric follows the page's "Include cache"
  // pill via the shared tokensOf (all four kinds on, fresh input+output off), like the other breakdowns. A
  // null equiv (no recognized model that day) reads as 0 intensity — honest n/a in the tooltip, no guessed cost.
  const valueOf = useCallback(
    (day: string): number => {
      const d = byDay.get(day);
      if (!d) return 0;
      if (metric === "turns") return d.turns;
      if (metric === "tokens") return tokensOf(d, includeCache);
      return d.equivApiValueUsd ?? 0;
    },
    [byDay, metric, includeCache],
  );

  const weeks = useMemo(
    () => calendarGrid(startDay, endDay),
    [startDay, endDay],
  );
  // Adaptive buckets over only the in-range days' values (padding cells are out of window).
  const thresholds = useMemo(
    () =>
      intensityThresholds(
        weeks
          .flat()
          .filter((c) => c.inRange)
          .map((c) => valueOf(c.day)),
        CALENDAR_RAMP.length,
      ),
    [weeks, valueOf],
  );
  const levelOf = useCallback(
    (day: string): number => intensityLevel(valueOf(day), thresholds),
    [valueOf, thresholds],
  );
  const monthLabels = useMemo(
    () =>
      monthLabelCols(weeks).map((m) => ({
        col: m.col,
        label: formatMonthShort(m.firstDay),
      })),
    [weeks],
  );

  // The active-metric value as a display string — shared by the hover tooltip and the cell's aria-label.
  const valueLabel = (day: string): string => {
    const d = byDay.get(day);
    if (metric === "turns") {
      const n = d?.turns ?? 0;
      return `${n.toLocaleString("en-US")} ${n === 1 ? "turn" : "turns"}`;
    }
    if (metric === "tokens")
      return `${formatTokensShort(d ? tokensOf(d, includeCache) : 0)} tokens`;
    return d?.equivApiValueUsd == null ? "n/a" : formatUsd(d.equivApiValueUsd);
  };
  const renderTooltip = (day: string): ReactNode => (
    <div className="flex flex-col gap-0.5">
      <div className="font-medium text-fg">{formatDayLong(day)}</div>
      <div className="text-fg-muted">{valueLabel(day)}</div>
    </div>
  );
  // The screen-reader label for a day cell: the date plus its value under the active metric.
  const describeDay = (day: string): string =>
    `${formatDayLong(day)}: ${valueLabel(day)}`;

  return (
    <StatsPanel
      title="Contributions"
      right={
        <div className="flex items-center gap-2">
          <YearSwitcher years={years} value={year} onChange={onYear} />
          <CalMetricToggle value={metric} onChange={onMetric} />
        </div>
      }
    >
      <CalendarHeatmap
        weeks={weeks}
        levelOf={levelOf}
        colors={CALENDAR_RAMP}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        renderTooltip={renderTooltip}
        ariaLabelOf={describeDay}
        monthLabels={monthLabels}
      />
      {/* Less -> More ramp legend. */}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-fg-faint">
        <span>Less</span>
        {CALENDAR_RAMP.map((c, i) => (
          <span
            key={i}
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: c }}
          />
        ))}
        <span>More</span>
      </div>
    </StatsPanel>
  );
}

/** The calendar's metric toggle (Turns / Tokens / Equiv API value), styled like the daily chart's
 *  StackByToggle, pinned in the Contributions panel header. */
function CalMetricToggle({
  value,
  onChange,
}: {
  value: CalMetric;
  onChange: (v: CalMetric) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-ink-800 bg-ink-900 p-0.5 text-[11px]">
      {CAL_METRIC_OPTS.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={v === value}
          className={`rounded px-2 py-0.5 transition-colors ${
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

/** The calendar's year switcher: "Last 12 months" (the trailing default) plus each year that holds data,
 *  descending. A native select so it scales to a long history without crowding the header. */
function YearSwitcher({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number | null;
  onChange: (y: number | null) => void;
}) {
  return (
    <select
      value={value ?? "trailing"}
      onChange={(e) =>
        onChange(e.target.value === "trailing" ? null : Number(e.target.value))
      }
      className="rounded-md border border-ink-800 bg-ink-900 px-2 py-0.5 text-[11px] text-fg-muted"
    >
      <option value="trailing">Last 12 months</option>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}

/** The headline KPI strip: Sessions, Turns, Tokens (with a mini kind-split bar), and Equivalent API value
 *  (with the reference-figure explainer). Replaces the old Totals card. The Tokens number and its split
 *  both follow the page's Include-cache toggle, so the bar and the figure above it always agree. */
function KpiStrip({
  totals,
  includeCache,
}: {
  totals: StatsTotals;
  includeCache: boolean;
}) {
  // Segments under the Tokens number, in the shared cost-palette order. Cache off counts fresh tokens
  // only, so drop the two cache segments — then the bar composition matches the number above it.
  const kindSegments = includeCache
    ? [
        { value: totals.inputTokens, color: COST_SEGMENT_COLORS[0] },
        { value: totals.outputTokens, color: COST_SEGMENT_COLORS[1] },
        { value: totals.cacheReadTokens, color: COST_SEGMENT_COLORS[2] },
        { value: totals.cacheCreationTokens, color: COST_SEGMENT_COLORS[3] },
      ]
    : [
        { value: totals.inputTokens, color: COST_SEGMENT_COLORS[0] },
        { value: totals.outputTokens, color: COST_SEGMENT_COLORS[1] },
      ];
  const tokenTotal = includeCache
    ? totals.inputTokens +
      totals.outputTokens +
      totals.cacheReadTokens +
      totals.cacheCreationTokens
    : totals.inputTokens + totals.outputTokens;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label="Sessions"
        value={totals.sessions.toLocaleString("en-US")}
      />
      <KpiCard label="Turns" value={totals.turns.toLocaleString("en-US")} />
      <KpiCard label="Tokens" value={formatTokensShort(tokenTotal)}>
        <StackedBar segments={kindSegments} height={6} className="mt-3" />
        <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[9px] text-fg-faint">
          {KIND_LABELS.slice(0, kindSegments.length).map((label, i) => (
            <span key={label} className="flex items-center gap-1">
              <Swatch color={COST_SEGMENT_COLORS[i]} />
              {label}
            </span>
          ))}
        </div>
      </KpiCard>
      <KpiCard
        label="Equiv API value"
        value={formatUsd(totals.equivApiValueUsd)}
      >
        <div className="mt-2 flex items-center gap-1 text-[10px] text-fg-faint">
          <span>reference, not money owed</span>
          <span className="relative">
            <InfoButton
              label="About Equivalent API value"
              popoverClassName="left-0 top-full mt-1.5 w-56 rounded-md border border-ink-700 bg-ink-900 px-2.5 py-2 text-[11px] leading-snug text-fg-muted shadow-lg"
            >
              What these tokens would cost at API rates. A reference figure for
              a subscription account, never money owed.
            </InfoButton>
          </span>
        </div>
      </KpiCard>
    </div>
  );
}

/** One headline KPI: an uppercase eyebrow over a large display figure, with an optional detail slot below
 *  (the Tokens card's mini split bar, or the Equiv card's subline + info popover). */
function KpiCard({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-ink-800 bg-ink-925 px-4 py-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-faint">
        {label}
      </div>
      <div className="mt-1.5 font-display text-[28px] leading-none tracking-tight text-fg">
        {value}
      </div>
      {children}
    </div>
  );
}

/** Whether the daily bars stack by token kind (the default — input/output/cache-read/cache-write) or by
 *  model. A page-local toggle; the daily payload carries both stackings so switching needs no re-fetch. */
type StackBy = "kind" | "model";

const STACK_LABELS: Record<StackBy, string> = { kind: "Kind", model: "Model" };
const STACK_OPTS = Object.entries(STACK_LABELS) as [StackBy, string][];

/** The by-kind segment labels, paired by index with COST_SEGMENT_COLORS (input/output/cache-read/
 *  cache-write). One source for the legend, the tooltip, and the stack order. */
const KIND_LABELS = ["Input", "Output", "Cache read", "Cache write"] as const;

/** An in-module sentinel for the null ("Unknown") model, so the per-day lookup map keys it distinctly from
 *  any real raw id (a single space can't be a real model id). Used only as a Map key here, never as a React
 *  key, so it needn't be the NUL the ByModel table uses for its null-model React key. */
const NULL_MODEL_KEY = " ";
const modelKey = (raw: string | null): string => raw ?? NULL_MODEL_KEY;

/**
 * The daily usage time-series (#114): one stacked SVG bar per local calendar day across the active range,
 * with a readable Y axis and a hover tooltip giving that day's exact numbers. The stack-by toggle (in this
 * panel's header, top-right) switches between token kind (default) and model; both stackings ride the same
 * payload, so it never re-fetches. The chart shows the full token composition regardless of the page's
 * "Include cache" pill — cache is its own segment here, not a hidden total.
 *
 * The store's daily buckets are sparse (only days with turns); we densify the contiguous range so a quiet
 * day reads as a gap. The range's start and end days come from rangeWindow (the same bounds main scopes
 * to): a single-day range renders one column; all-time starts at the earliest bucket. The model series order and colors come from the snapshot's
 * byModel (its store order, tokens desc), so the chart matches the By-model panel in the default cache-on
 * view; with "Include cache" off that panel re-ranks and can recolor, which the chart doesn't follow.
 */
function DailyUsage({
  daily,
  byModel,
  range,
}: {
  daily: DailyBucket[];
  byModel: StatsByModel[];
  range: StatsRange;
}) {
  const [stackBy, setStackBy] = useState<StackBy>("kind");

  // Contiguous calendar axis for the active window. startDay is the window's first local day (all-time: the
  // earliest bucket, or today when empty); endDay is its last (today for an open-topped preset, or the
  // clicked day for a single-day range). Recomputed each render off Date.now(); a midnight tick self-corrects.
  const now = Date.now();
  const { sinceMs, untilMs } = rangeWindow(range, now);
  const endDay = untilMs != null ? localDayKey(untilMs - 1) : localDayKey(now);
  const startDay =
    sinceMs != null ? localDayKey(sinceMs) : (daily[0]?.day ?? endDay);
  const days = densifyDays(daily, startDay, endDay);

  // Model series: the snapshot's byModel order (tokens desc), each paired by store index to a cycled color,
  // so the hue matches the By-model panel's cache-on assignment. Drop any model that never lands on a
  // rendered day: in the all-time view byModel can carry a model whose turns are all unknown-time (ts=0),
  // which daily excludes — without this it would sit in the legend with no bar. Pairing the color before the
  // filter keeps the survivors' hues aligned with the By-model panel (it indexes by the same store order).
  const presentModels = new Set<string>();
  for (const d of days)
    for (const e of d.byModel) presentModels.add(modelKey(e.modelRaw));
  const series = byModel
    .map((r, i) => ({
      modelRaw: r.modelRaw,
      color: MODEL_SEGMENT_COLORS[i % MODEL_SEGMENT_COLORS.length],
    }))
    .filter((s) => presentModels.has(modelKey(s.modelRaw)));

  // Per-day model lookup so a column can pull each series' total in O(1) (0 when the model was idle).
  const perDayModel = days.map((d) => {
    const m = new Map<string, number>();
    for (const e of d.byModel) m.set(modelKey(e.modelRaw), e.totalTokens);
    return m;
  });

  const columns: DayColumn[] = days.map((d, i) =>
    stackBy === "kind"
      ? {
          key: d.day,
          segments: [
            { value: d.inputTokens, color: COST_SEGMENT_COLORS[0] },
            { value: d.outputTokens, color: COST_SEGMENT_COLORS[1] },
            { value: d.cacheReadTokens, color: COST_SEGMENT_COLORS[2] },
            { value: d.cacheCreationTokens, color: COST_SEGMENT_COLORS[3] },
          ],
        }
      : {
          key: d.day,
          segments: series.map((s) => ({
            value: perDayModel[i].get(modelKey(s.modelRaw)) ?? 0,
            color: s.color,
          })),
        },
  );

  // Thin the x labels to ~8 across the range so they never crowd. Anchor the stride to the LAST day so
  // today (the rightmost, most-read bar) always carries a date; labels then march back evenly from there,
  // rather than from index 0 where the final day usually falls between strides and goes unlabeled.
  const stride = Math.max(1, Math.ceil(days.length / 8));
  const lastPhase = (days.length - 1) % stride;
  const xLabels = days
    .map((d, i) => ({ index: i, label: formatDayShort(d.day) }))
    .filter(({ index }) => index % stride === lastPhase);

  const legend =
    stackBy === "kind"
      ? KIND_LABELS.map((label, i) => ({
          label,
          color: COST_SEGMENT_COLORS[i],
        }))
      : series.map((s) => ({
          label: s.modelRaw ?? "Unknown",
          color: s.color,
        }));

  const renderTooltip = (i: number): ReactNode => {
    const d = days[i];
    const total =
      d.inputTokens +
      d.outputTokens +
      d.cacheReadTokens +
      d.cacheCreationTokens;
    const rows =
      stackBy === "kind"
        ? [
            {
              label: "Input",
              value: d.inputTokens,
              color: COST_SEGMENT_COLORS[0],
            },
            {
              label: "Output",
              value: d.outputTokens,
              color: COST_SEGMENT_COLORS[1],
            },
            {
              label: "Cache read",
              value: d.cacheReadTokens,
              color: COST_SEGMENT_COLORS[2],
            },
            {
              label: "Cache write",
              value: d.cacheCreationTokens,
              color: COST_SEGMENT_COLORS[3],
            },
          ].filter((r) => r.value > 0)
        : series
            .map((s) => ({
              label: s.modelRaw ?? "Unknown",
              value: perDayModel[i].get(modelKey(s.modelRaw)) ?? 0,
              color: s.color,
            }))
            .filter((r) => r.value > 0);
    return (
      <div className="flex flex-col gap-1">
        <div className="font-medium text-fg">{formatDayLong(d.day)}</div>
        {rows.length === 0 ? (
          <div className="text-fg-faint">No usage</div>
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
          <span className="text-fg-muted">Total</span>
          <span className="ml-auto pl-3 font-mono tabular-nums text-fg">
            {formatTokensShort(total)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <StatsPanel
      title="Daily usage"
      right={<StackByToggle value={stackBy} onChange={setStackBy} />}
    >
      <BarSeries
        columns={columns}
        formatTick={formatTokensShort}
        xLabels={xLabels}
        renderTooltip={renderTooltip}
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <Swatch color={l.color} />
            <span className="truncate text-fg-muted">{l.label}</span>
          </span>
        ))}
      </div>
    </StatsPanel>
  );
}

/** The daily chart's stack-by toggle (Kind / Model), styled like RangeFilter's pill group. Lives in the
 *  Daily usage panel's header, top-right (#114). */
function StackByToggle({
  value,
  onChange,
}: {
  value: StackBy;
  onChange: (v: StackBy) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-ink-800 bg-ink-900 p-0.5 text-[11px]">
      {STACK_OPTS.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={v === value}
          className={`rounded px-2 py-0.5 transition-colors ${
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

/** The page-level "Include cache" control in the Stats header, governing the Tokens metric across every
 *  breakdown. A checkbox: a filled, sky-ticked box when on (count all four token kinds), an empty box when
 *  off (fresh input + output only). Cost always prices every kind, as the tooltip notes. The checkbox reads
 *  its binary state at a glance and stays visually distinct from the range pill group beside it. */
function CacheToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title="Count cache-read and cache-creation tokens in the token figures (cost always includes them)"
      className="flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2 py-1 text-[11px] text-fg-muted transition-colors hover:border-ink-700"
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border transition-colors ${
          on
            ? "border-primary bg-primary text-ink-950"
            : "border-ink-700 text-transparent"
        }`}
      >
        <Icon name="check" size={10} />
      </span>
      Include cache
    </button>
  );
}

/** The per-model breakdown (#111): a donut sized by each model's token share beside a table of tokens and
 *  Equivalent API value per raw model id. The page-level "Include cache" pill (in the header) picks the
 *  token metric (via the shared `tokensOf`) for both the donut and the Tokens column together, so the
 *  donut share always matches the visible numbers. Default on (all four kinds), so a cache-heavy model can
 *  dominate the donut. Cost is unaffected; it always reflects every token at its rate. An unrecognized id
 *  shows n/a cost while its tokens still count; a turn with no recorded model rows as "Unknown". Color is
 *  paired onto each row so the donut and the table legend read off one source, no zip-by-index that could
 *  drift if rows reorder. */
function ByModel({
  rows,
  includeCache,
}: {
  rows: StatsByModel[];
  includeCache: boolean;
}) {
  // Skip on a window with no tokens at all, judged on the full total so flipping the toggle never makes the
  // whole panel vanish; at worst the donut hides on a pure-cache window in exclude mode (below).
  if (!rows.some((r) => r.totalTokens > 0)) return null;
  // Re-rank by the displayed metric so the table reads biggest-first and the donut colors pair to it; ties
  // break by raw id for stability. Color is assigned after the sort so it tracks the row, not the model.
  const ranked = rows
    .map((r) => ({ ...r, tokens: tokensOf(r, includeCache) }))
    .sort(
      (a, b) =>
        b.tokens - a.tokens ||
        (a.modelRaw ?? "").localeCompare(b.modelRaw ?? ""),
    )
    .map((r, i) => ({
      ...r,
      color: MODEL_SEGMENT_COLORS[i % MODEL_SEGMENT_COLORS.length],
    }));
  // When the chosen metric is zero for every row (a pure cache-read window in exclude mode) the donut would
  // be a featureless track, so drop it and let the table stand alone.
  const segments = ranked.map((r) => ({ value: r.tokens, color: r.color }));
  const hasDonut = segments.some((s) => s.value > 0);
  return (
    <StatsPanel title="By model">
      <div className="flex items-center gap-4">
        {hasDonut && <Donut segments={segments} />}
        <table className="min-w-0 flex-1 text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-fg-faint">
              <th scope="col" className="pb-1.5 text-left font-normal">
                Model
              </th>
              <th scope="col" className="pb-1.5 text-right font-normal">
                Tokens
              </th>
              <th scope="col" className="pb-1.5 text-right font-normal">
                Equiv API value
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Key on the raw id (unique per GROUP BY row); the null "Unknown" bucket gets a NUL sentinel a
                real model id can never be, so it can't collide with a model whose raw string is "unknown". */}
            {ranked.map((r) => (
              <tr
                key={r.modelRaw ?? "\u0000"}
                className="border-t border-ink-850"
              >
                <td className="py-1 pr-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Swatch color={r.color} />
                    <span className="truncate text-fg">
                      {r.modelRaw ?? "Unknown"}
                    </span>
                  </span>
                </td>
                <td className="py-1 text-right font-mono tabular-nums text-fg-muted">
                  {formatTokensShort(r.tokens)}
                </td>
                <td className="py-1 text-right font-mono tabular-nums text-fg-muted">
                  {r.equivApiValueUsd == null
                    ? "n/a"
                    : formatUsd(r.equivApiValueUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StatsPanel>
  );
}

/** The per-project breakdown (#112), now with its branches folded in. Top projects as horizontal bars with
 *  tokens and Equivalent API value; a project with real branch detail carries a disclosure caret that
 *  reveals its branches (label, tokens, Equiv) as indented sub-rows. Keyed on the full cwd so two repos that
 *  share a basename stay separate and a branch never lands under the wrong one; projects and branches both
 *  rank by the displayed Tokens metric, so order and caps follow the page's Include-cache toggle. Capped to
 *  the top N projects with a "+N more" note that flags when those hidden projects still carry branch detail
 *  (folded under the top-N, it's otherwise unreachable); each expanded project caps its branches the same way. */
function ByProject({
  rows,
  branches,
  includeCache,
}: {
  rows: StatsByProject[];
  branches: StatsByBranch[];
  includeCache: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  if (!rows.some((r) => r.totalTokens > 0)) return null;
  const groups = groupProjectBranches(rows, branches, includeCache);
  const top = groups.slice(0, TOP_PROJECTS);
  // Bars size on the displayed metric; the denominator is the largest shown value. A zero denominator (a
  // pure cache window in exclude mode) yields empty bars rather than a divide-by-zero.
  const max = Math.max(...top.map((r) => tokensOf(r, includeCache)));
  // Projects past the cap roll into the "+N more" note. Flag when any of them still carries branch detail:
  // folding branches under the top-N projects means those branches are otherwise unreachable on the page.
  const hidden = groups.slice(TOP_PROJECTS);
  const rest = hidden.length;
  const hiddenHaveBranches = hidden.some((g) => g.expandable);
  const toggle = (cwd: string): void =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  return (
    <StatsPanel title="By project">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-fg-faint">
            <th scope="col" className="pb-1.5 text-left font-normal">
              Project
            </th>
            <th scope="col" className="pb-1.5 text-right font-normal">
              Tokens
            </th>
            <th scope="col" className="pb-1.5 text-right font-normal">
              Equiv API value
            </th>
          </tr>
        </thead>
        <tbody>
          {top.map((r) => {
            // Gate on expandable too: a project can lose its last real branch on a later poll (a trailing
            // window ages it out), dropping the chevron while its cwd lingers in `open`. Without this the
            // sub-rows would render stuck open with nothing to collapse them; folding it in also makes any
            // stranded `open` entry inert.
            const isOpen = r.expandable && open.has(r.cwd);
            return (
              <Fragment key={r.cwd}>
                <tr className="border-t border-ink-850">
                  <td className="py-1.5 pr-3 align-middle">
                    <div className="flex min-w-0 flex-col gap-1">
                      {r.expandable ? (
                        <button
                          type="button"
                          onClick={() => toggle(r.cwd)}
                          aria-expanded={isOpen}
                          title={r.cwd}
                          className="flex min-w-0 items-center gap-1 text-left text-fg"
                        >
                          <Icon
                            name="chevron-right"
                            size={11}
                            className={`shrink-0 text-fg-faint transition-transform ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          />
                          <span className="truncate">{r.project}</span>
                        </button>
                      ) : (
                        <span
                          className="truncate pl-[15px] text-fg"
                          title={r.cwd}
                        >
                          {r.project}
                        </span>
                      )}
                      <Bar
                        pct={
                          max > 0 ? (tokensOf(r, includeCache) / max) * 100 : 0
                        }
                        fill="bg-working/70"
                        className="w-full"
                      />
                    </div>
                  </td>
                  <td className="py-1.5 pl-2 text-right align-middle font-mono tabular-nums text-fg-muted">
                    {formatTokensShort(tokensOf(r, includeCache))}
                  </td>
                  <td className="py-1.5 pl-2 text-right align-middle font-mono tabular-nums text-fg-muted">
                    {r.equivApiValueUsd == null
                      ? "n/a"
                      : formatUsd(r.equivApiValueUsd)}
                  </td>
                </tr>
                {isOpen &&
                  r.branches.map((b) => (
                    <tr
                      key={branchRowKey(b.cwd, b.branch)}
                      className="bg-ink-900/30"
                    >
                      <td className="py-1 pr-3 pl-[22px]">
                        <span className="block truncate font-mono text-[11px] text-fg-muted">
                          {b.branch ?? "—"}
                        </span>
                      </td>
                      <td className="py-1 pl-2 text-right font-mono text-[11px] tabular-nums text-fg-faint">
                        {formatTokensShort(tokensOf(b, includeCache))}
                      </td>
                      <td className="py-1 pl-2 text-right font-mono text-[11px] tabular-nums text-fg-faint">
                        {b.equivApiValueUsd == null
                          ? "n/a"
                          : formatUsd(b.equivApiValueUsd)}
                      </td>
                    </tr>
                  ))}
                {isOpen && r.branchOverflow > 0 && (
                  <tr className="bg-ink-900/30">
                    <td
                      colSpan={3}
                      className="py-1 pl-[22px] text-[10px] text-fg-faint"
                    >
                      +{r.branchOverflow}{" "}
                      {r.branchOverflow === 1 ? "more branch" : "more branches"}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {rest > 0 && (
        <p className="mt-2 text-[11px] text-fg-faint">
          +{rest} more {rest === 1 ? "project" : "projects"}
          {hiddenHaveBranches && " (branches hidden)"}
        </p>
      )}
    </StatsPanel>
  );
}

/** A capped display list: the per-Session table can run to hundreds of rows over all-time, so it shows the
 *  top N by the ACTIVE sort with a "+N more" note — sort-then-cap, so re-sorting by cost surfaces the most
 *  expensive sessions across all history, not a reshuffle of the most-recent N. */
const TOP_SESSIONS = 50;

/** One sortable column header: a button that toggles the active sort. Clicking an inactive column sorts it
 *  by its natural first direction (defaultDirFor); clicking the active column flips direction. The active
 *  column shows a chevron, rotated up when ascending. `aria-sort` rides the th for assistive tech. */
function SortHeader({
  label,
  column,
  sort,
  onSort,
  align = "right",
}: {
  label: string;
  column: SessionSortKey;
  sort: SessionSort;
  onSort: (key: SessionSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === column;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      className={`pb-1.5 font-normal ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-0.5 transition-colors hover:text-fg ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-fg-muted" : ""}`}
      >
        {label}
        {active && (
          <Icon
            name="chevron-down"
            size={10}
            className={sort.dir === "asc" ? "rotate-180" : ""}
          />
        )}
      </button>
    </th>
  );
}

/** The per-Session table (#113): one row per Session with its project, last activity, duration, dominant
 *  model, turns, tokens, and Equivalent API value. Sortable on every column (client-side via sortSessions),
 *  defaulting to most recent activity first. The Tokens column follows the page's "Include cache" toggle,
 *  like the other breakdowns. Capped to the top N by the active sort with a "+N more" note. The model shown
 *  is the session's dominant one by tokens; cost still sums across all its models, so it's n/a only when no
 *  turn ran a recognized model. */
function BySession({
  rows,
  includeCache,
}: {
  rows: StatsBySession[];
  includeCache: boolean;
}) {
  const [sort, setSort] = useState<SessionSort>(DEFAULT_SESSION_SORT);
  // Guard on the full set so the panel never vanishes on a pure-zero window (matches the other breakdowns).
  if (!rows.some((r) => r.totalTokens > 0)) return null;
  const onSort = (key: SessionSortKey): void =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultDirFor(key) },
    );
  const sorted = sortSessions(rows, sort, includeCache);
  const top = sorted.slice(0, TOP_SESSIONS);
  const rest = sorted.length - top.length;
  const now = Date.now();
  return (
    <StatsPanel title="By session">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-fg-faint">
            <SortHeader
              label="Project"
              column="project"
              sort={sort}
              onSort={onSort}
              align="left"
            />
            <SortHeader
              label="Model"
              column="model"
              sort={sort}
              onSort={onSort}
              align="left"
            />
            <SortHeader
              label="Last activity"
              column="lastActivity"
              sort={sort}
              onSort={onSort}
            />
            <SortHeader
              label="Duration"
              column="duration"
              sort={sort}
              onSort={onSort}
            />
            <SortHeader
              label="Turns"
              column="turns"
              sort={sort}
              onSort={onSort}
            />
            <SortHeader
              label="Tokens"
              column="tokens"
              sort={sort}
              onSort={onSort}
            />
            <SortHeader
              label="Equiv API value"
              column="cost"
              sort={sort}
              onSort={onSort}
            />
          </tr>
        </thead>
        <tbody>
          {/* Key on the session id (globally unique). */}
          {top.map((r) => (
            <tr key={r.sessionId} className="border-t border-ink-850">
              <td className="py-1 pr-3">
                <span className="block truncate text-fg" title={r.cwd}>
                  {r.project}
                </span>
              </td>
              <td className="py-1 pr-3">
                <span className="block truncate font-mono text-fg-muted">
                  {r.modelRaw ?? "Unknown"}
                </span>
              </td>
              <td className="py-1 pl-2 text-right tabular-nums text-fg-muted">
                {/* lastActivityMs is 0 only when no turn had a known time; show a dash, not a
                    formatRelativeTime epoch render ("20000d ago") that fakes exact data. */}
                {r.lastActivityMs === 0
                  ? "—"
                  : formatRelativeTime(r.lastActivityMs, now)}
              </td>
              <td className="py-1 pl-2 text-right font-mono tabular-nums text-fg-muted">
                {formatDuration(r.durationMs)}
              </td>
              <td className="py-1 pl-2 text-right font-mono tabular-nums text-fg-muted">
                {r.turns.toLocaleString("en-US")}
              </td>
              <td className="py-1 pl-2 text-right font-mono tabular-nums text-fg-muted">
                {formatTokensShort(tokensOf(r, includeCache))}
              </td>
              <td className="py-1 pl-2 text-right font-mono tabular-nums text-fg-muted">
                {r.equivApiValueUsd == null
                  ? "n/a"
                  : formatUsd(r.equivApiValueUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rest > 0 && (
        <p className="mt-2 text-[11px] text-fg-faint">
          +{rest} more {rest === 1 ? "session" : "sessions"}
        </p>
      )}
    </StatsPanel>
  );
}

function EmptyStats() {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-24 text-fg-faint">
      <Icon name="chart-column" size={28} />
      <p className="text-[13px]">No usage yet.</p>
    </div>
  );
}

/** A bordered, titled section box for the stats page. `right` is an optional controls slot pinned to the
 *  header's top-right (e.g. the daily chart's stack-by toggle), so a panel can carry its own control
 *  without a shared page toolbar. */
function StatsPanel({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-ink-800 bg-ink-925 p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
          {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}
