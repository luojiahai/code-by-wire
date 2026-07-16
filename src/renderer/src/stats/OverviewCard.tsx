import { useCallback, useMemo, type ReactNode } from "react";
import {
  type CalendarDay,
  type StatsByModel,
  type StatsRecords,
  type StatsTotals,
} from "@shared/stats";
import { formatTokensShort } from "@shared/format";
import { useI18n } from "../i18n";
import { CalendarHeatmap } from "../ui/charts";
import { CALENDAR_RAMP } from "../ui/meta";
import {
  calendarGrid,
  intensityThresholds,
  intensityLevel,
  monthLabelCols,
} from "../ui/contributions-geom";
import { StatsCard, CardDivider, CardRegion, KpiTile } from "./shared";

/** An em-dash placeholder for a tile whose window holds no data (spec: Visual language). */
const EMPTY = "—";

/**
 * Card 1 (#spec 2026-07-03): the 8-tile KPI grid — exactly Claude Code's stats set (Sessions, Tokens,
 * Favorite model, Active days, Most active day, Longest session, Longest streak, Current streak;
 * Turns deliberately absent) — over the contributions heatmap. One border; a full-width hairline
 * splits the two regions. Every tile except the streaks follows the page range; the streaks are
 * all-time by design (see StatsRecords).
 */
export function OverviewCard({
  totals,
  records,
  byModel,
  calendar,
  calendarStart,
  calendarEnd,
  calendarYears,
  calendarYear,
  onCalendarYear,
  selectedDay,
  onSelectDay,
}: {
  totals: StatsTotals;
  records: StatsRecords;
  byModel: StatsByModel[];
  calendar: CalendarDay[];
  calendarStart: string;
  calendarEnd: string;
  calendarYears: number[];
  calendarYear: number | null;
  onCalendarYear: (y: number | null) => void;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const { t } = useI18n();
  const empty = totals.turns === 0;

  // Favorite model: the top byModel row by total tokens, so the tile always agrees with the By-model
  // list's order. Ties break by raw id, like the old panel.
  const favorite = useMemo(() => {
    if (empty || byModel.length === 0) return null;
    const top = byModel
      .slice()
      .sort(
        (a, b) =>
          b.totalTokens - a.totalTokens ||
          (a.modelRaw ?? "").localeCompare(b.modelRaw ?? ""),
      )[0];
    return top.modelRaw ?? t.stats.shared.unknownModel;
  }, [empty, byModel, t]);

  // The Tokens tile figure: all four token kinds, matching every other token figure on the page.
  const tokenTotal =
    totals.inputTokens +
    totals.outputTokens +
    totals.cacheReadTokens +
    totals.cacheCreationTokens;

  // Cell hairlines for a fixed 4×2 grid: every cell draws right+bottom, the 4th column drops right,
  // the second row drops bottom. Index-driven so the markup stays a flat list.
  const cellBorder = (i: number): string =>
    `border-ink-850 ${(i + 1) % 4 === 0 ? "" : "border-r "}${i < 4 ? "border-b" : ""}`;

  const streak = (n: number): ReactNode => (
    <>
      {n.toLocaleString("en-US")}
      <span className="text-fg-faint"> {t.stats.overview.streakUnit(n)}</span>
    </>
  );

  return (
    <StatsCard>
      <div className="grid grid-cols-4">
        <KpiTile label={t.stats.overview.sessions} className={cellBorder(0)}>
          {totals.sessions.toLocaleString("en-US")}
        </KpiTile>
        <KpiTile label={t.stats.overview.tokens} className={cellBorder(1)}>
          {formatTokensShort(tokenTotal)}
        </KpiTile>
        <KpiTile
          label={t.stats.overview.favoriteModel}
          title={favorite ?? undefined}
          className={cellBorder(2)}
        >
          {favorite ?? EMPTY}
        </KpiTile>
        <KpiTile label={t.stats.overview.activeDays} className={cellBorder(3)}>
          {records.activeDays.toLocaleString("en-US")}
          <span className="text-fg-faint">
            /{records.windowDays.toLocaleString("en-US")}
          </span>
        </KpiTile>
        <KpiTile
          label={t.stats.overview.mostActiveDay}
          className={cellBorder(4)}
        >
          {records.mostActiveDay
            ? t.time.dayShort(records.mostActiveDay)
            : EMPTY}
        </KpiTile>
        <KpiTile
          label={t.stats.overview.longestSession}
          className={cellBorder(5)}
        >
          {records.longestSessionMs > 0
            ? t.time.duration(records.longestSessionMs)
            : EMPTY}
        </KpiTile>
        <KpiTile
          label={t.stats.overview.longestStreak}
          className={cellBorder(6)}
        >
          {streak(records.longestStreakDays)}
        </KpiTile>
        <KpiTile
          label={t.stats.overview.currentStreak}
          className={cellBorder(7)}
        >
          {streak(records.currentStreakDays)}
        </KpiTile>
      </div>
      {calendarStart !== "" && (
        <>
          <CardDivider />
          <Contributions
            days={calendar}
            startDay={calendarStart}
            endDay={calendarEnd}
            years={calendarYears}
            year={calendarYear}
            onYear={onCalendarYear}
            selectedDay={selectedDay}
            onSelectDay={onSelectDay}
          />
        </>
      )}
    </StatsCard>
  );
}

/**
 * The contributions region (#115, revised by #spec 2026-07-03): the year-windowed heatmap, intensity
 * ALWAYS by total tokens (all four kinds; the Turns/Tokens metric toggle is retired). Clicking a day
 * drives the page range to that date; the calendar window itself stays independent of the page range.
 */
function Contributions({
  days,
  startDay,
  endDay,
  years,
  year,
  onYear,
  selectedDay,
  onSelectDay,
}: {
  days: CalendarDay[];
  startDay: string;
  endDay: string;
  years: number[];
  year: number | null;
  onYear: (y: number | null) => void;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const { t } = useI18n();
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const valueOf = useCallback(
    (day: string): number => byDay.get(day)?.totalTokens ?? 0,
    [byDay],
  );

  const weeks = useMemo(
    () => calendarGrid(startDay, endDay),
    [startDay, endDay],
  );
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
        label: t.time.monthShort(m.firstDay),
      })),
    [weeks, t],
  );

  const valueLabel = (day: string): string =>
    t.stats.overview.tokensLabel(formatTokensShort(valueOf(day)));
  const renderTooltip = (day: string): ReactNode => (
    <div className="flex flex-col gap-0.5">
      <div className="font-medium text-fg">{t.time.dayLong(day)}</div>
      <div className="text-fg-muted">{valueLabel(day)}</div>
    </div>
  );
  const describeDay = (day: string): string =>
    t.stats.overview.dayTokensAria(t.time.dayLong(day), valueLabel(day));

  return (
    <CardRegion
      title={t.stats.overview.contributions}
      right={<YearSwitcher years={years} value={year} onChange={onYear} />}
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
      <div className="mt-3 flex items-center gap-1.5 text-label text-fg-faint">
        <span>{t.stats.overview.less}</span>
        {CALENDAR_RAMP.map((c, i) => (
          <span
            key={i}
            className="inline-block h-2.5 w-2.5 rounded-xs"
            style={{ background: c }}
          />
        ))}
        <span>{t.stats.overview.more}</span>
      </div>
    </CardRegion>
  );
}

/** The calendar's year switcher — moved verbatim from StatsView. */
function YearSwitcher({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number | null;
  onChange: (y: number | null) => void;
}) {
  const { t } = useI18n();
  return (
    <select
      value={value ?? "trailing"}
      onChange={(e) =>
        onChange(e.target.value === "trailing" ? null : Number(e.target.value))
      }
      className="rounded-md border border-ink-800 bg-ink-900 px-2 py-1 text-meta text-fg-muted"
    >
      <option value="trailing">{t.stats.overview.trailingYear}</option>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
