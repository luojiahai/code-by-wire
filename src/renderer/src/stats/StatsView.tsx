import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { OverlayScroll } from "../ui/OverlayScroll";
import {
  type StatsSnapshot,
  type ScanProgress,
  type StatsByProject,
  type StatsBySession,
  type StatsRange,
  DEFAULT_RANGE,
  emptySnapshot,
  tokensOf,
  isDayRange,
} from "@shared/stats";
import {
  formatTokensShort,
  formatDuration,
  formatRelativeTime,
  formatDayShort,
} from "@shared/format";
import { Icon } from "../ui/icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { modelColorOf } from "../ui/meta";
import { Swatch } from "../ui/atoms";
import { CopyButton } from "../ui/CopyButton";
import {
  sortSessions,
  defaultDirFor,
  DEFAULT_SESSION_SORT,
  type SessionSort,
  type SessionSortKey,
} from "./session-sort";
import { RangeFilter, CacheToggle, StatsPanel } from "./shared";
import { OverviewCard } from "./OverviewCard";
import { ModelsCard } from "./ModelsCard";

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

  // The last change token from stats:read, echoed back as `since`. Reset on a range/year change so a filter
  // switch always forces a full snapshot.
  const tokenRef = useRef<string | undefined>(undefined);

  // Reset: a confirm-gated drop of the analytics store. Bumping resetNonce re-runs the poll effect, which
  // blanks the snapshot and clears the token, so the next poll shows "Building history…" as the rebuild runs.
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  // Track what last drove the poll effect, so the snapshot blanks only on a range change or a reset — never
  // on a calendar-year change, which re-queries just the heatmap and would otherwise flash the whole view.
  const prevRangeRef = useRef(range);
  const prevResetRef = useRef(resetNonce);
  // The icon spins / disables while a backfill is in progress — the post-reset rebuild and the first cold run.
  const rebuilding = !!snap && !snap.progress.done;

  const handleReset = useCallback(async () => {
    setConfirmReset(false);
    try {
      const r = await window.api.resetAnalytics();
      // ok:false (no store / failed clear) and a thrown bridge failure both land on the error banner; on
      // success clear any stale banner from a prior attempt and bump the nonce to re-run the poll.
      if (r.ok) {
        setResetError(false);
        setResetNonce((n) => n + 1);
      } else {
        setResetError(true);
      }
    } catch {
      setResetError(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    tokenRef.current = undefined; // new range/year: force a full snapshot on the next poll
    // Blank the cards back to loading rather than show the prior range's totals under the newly-pressed
    // button — but ONLY when the range changed or the store was reset, never on a calendar-year change. The
    // year is independent of the page totals (it re-queries just the heatmap), so blanking everything would
    // flash the whole view for a calendar-only change. Also skip when drilling into a day from the calendar:
    // blanking would unmount the calendar and re-fire its scroll-to-newest effect, flashing away from the cell.
    const rangeOrReset =
      prevRangeRef.current !== range || prevResetRef.current !== resetNonce;
    prevRangeRef.current = range;
    prevResetRef.current = resetNonce;
    if (rangeOrReset && !isDayRange(range)) setSnap(null);

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
  }, [range, calendarYear, resetNonce]);

  return (
    <OverlayScroll className="h-full min-w-0 flex-1 bg-ink-950 text-fg">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6">
        <div className="flex items-center justify-end gap-2">
          {isDayRange(range) && (
            <button
              type="button"
              onClick={() => setRange(DEFAULT_RANGE)}
              title="Clear the day filter"
              className="flex items-center gap-1 rounded-md border border-ink-700 bg-ink-700 px-2 py-0.5 text-meta text-fg transition-colors hover:bg-ink-600"
            >
              {formatDayShort(range.day)}
              <span aria-hidden className="text-fg-muted">
                ×
              </span>
            </button>
          )}
          <CacheToggle on={includeCache} onChange={setIncludeCache} />
          <RangeFilter value={range} onChange={setRange} />
          <span aria-hidden className="h-5 w-px bg-ink-800" />
          <button
            type="button"
            onClick={() => {
              setResetError(false);
              setConfirmReset(true);
            }}
            disabled={rebuilding}
            aria-label="Reset analytics"
            title="Reset analytics"
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon
              name="rotate-ccw"
              size={14}
              className={rebuilding ? "animate-spin" : undefined}
            />
          </button>
        </div>
        {confirmReset && (
          <ConfirmDialog
            title="Reset analytics?"
            body="This clears the computed stats and rebuilds them from your Claude transcripts. Nothing is permanently deleted, your history is recomputed from scratch, which takes a few seconds."
            confirmLabel="Reset"
            tone="danger"
            onCancel={() => setConfirmReset(false)}
            onConfirm={() => void handleReset()}
          />
        )}
        {resetError && (
          <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-meta text-danger">
            Couldn&apos;t reset analytics. Please try again.
          </div>
        )}
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
                <OverviewCard
                  totals={snap.totals}
                  records={snap.records}
                  byModel={snap.byModel}
                  includeCache={includeCache}
                  calendar={snap.calendar}
                  calendarStart={snap.calendarStart}
                  calendarEnd={snap.calendarEnd}
                  calendarYears={snap.calendarYears}
                  calendarYear={calendarYear}
                  onCalendarYear={setCalendarYear}
                  selectedDay={isDayRange(range) ? range.day : null}
                  onSelectDay={(day) => setRange({ day })}
                />
                <ModelsCard
                  daily={snap.daily}
                  byModel={snap.byModel}
                  range={range}
                  includeCache={includeCache}
                />
                {snap.byProject.length > 0 && (
                  <ByProject
                    rows={snap.byProject}
                    includeCache={includeCache}
                  />
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
      <div className="flex items-center justify-between text-meta text-fg-muted">
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

/** One row of a Breakdown panel: an entity with its displayed-metric tokens and the color its bar (and
 *  optional swatch) take. The caller ranks the rows and assigns colors; the panel slices to `cap`, sizes
 *  bars against the largest displayed value, and renders the header and "+N more" note. */
type BreakdownRow = {
  key: string;
  label: string;
  title?: string;
  tokens: number;
  color: string;
};

/** Display cap shared by the By model and By project panels: rows past the top N roll into a "+N more" note. */
const TOP_BREAKDOWN_ROWS = 7;

/** The shared ranked-breakdown panel behind By model and By project (#111/#112): a titled table of entities,
 *  biggest first, each a row of name + Tokens with a full-width bar beneath. The two callers differ only in
 *  props: model rows carry a per-model swatch (`showSwatch`); both cap to `cap.n` rows with a "+N more
 *  {cap.noun}s" note. The count and its noun ride in one object so a cap can't be set without the note that
 *  discloses it. Bars size against the largest DISPLAYED row, so a cap changes the denominator; an all-zero
 *  window yields empty bars rather than a divide-by-zero. The bar is built inline (not the `Bar` atom)
 *  because its color is a dynamic CSS value, not a Tailwind class. */
function Breakdown({
  title,
  nameLabel,
  rows,
  showSwatch = false,
  cap,
}: {
  title: string;
  nameLabel: string;
  rows: BreakdownRow[];
  showSwatch?: boolean;
  cap: { n: number; noun: string };
}) {
  const shown = rows.slice(0, cap.n);
  const max = Math.max(...shown.map((r) => r.tokens), 0);
  const rest = rows.length - shown.length;
  return (
    <StatsPanel title={title}>
      <table className="w-full table-fixed text-aux">
        <colgroup>
          <col className="w-[70%]" />
          <col className="w-[30%]" />
        </colgroup>
        <thead>
          <tr className="text-label uppercase tracking-wide text-fg-faint">
            <th
              scope="col"
              className="whitespace-nowrap pb-1.5 text-left font-normal"
            >
              {nameLabel}
            </th>
            <th
              scope="col"
              className="whitespace-nowrap pb-1.5 text-right font-normal"
            >
              Tokens
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <Fragment key={r.key}>
              <tr className={i === 0 ? "" : "border-t border-ink-850"}>
                <td className="pt-2 pr-3 align-middle">
                  <span className="flex min-w-0 items-center gap-2">
                    {showSwatch && <Swatch color={r.color} />}
                    <span className="truncate text-fg" title={r.title}>
                      {r.label}
                    </span>
                  </span>
                </td>
                <td className="pt-2 pl-2 text-right align-middle font-mono tabular-nums text-fg-muted">
                  {formatTokensShort(r.tokens)}
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="pb-2 pt-1.5">
                  <div className="h-[5px] overflow-hidden rounded-full bg-ink-850">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${max > 0 ? (r.tokens / max) * 100 : 0}%`,
                        background: r.color,
                      }}
                    />
                  </div>
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      {rest > 0 && (
        <p className="mt-2 text-meta text-fg-faint">
          +{rest} more {rest === 1 ? cap.noun : `${cap.noun}s`}
        </p>
      )}
    </StatsPanel>
  );
}

/** The per-project breakdown (#112): top projects as full-width bars with tokens, keyed on the full cwd so
 *  two repos that share a basename stay separate (the cwd rides along as the row's hover title). Ranks by
 *  the displayed Tokens metric, so order follows the page's Include-cache toggle; capped to the top N with a
 *  "+N more" note. Rendering is delegated to the shared `Breakdown`. */
function ByProject({
  rows,
  includeCache,
}: {
  rows: StatsByProject[];
  includeCache: boolean;
}) {
  if (!rows.some((r) => r.totalTokens > 0)) return null;
  const ranked: BreakdownRow[] = rows
    .slice()
    .sort(
      (a, b) =>
        tokensOf(b, includeCache) - tokensOf(a, includeCache) ||
        a.cwd.localeCompare(b.cwd),
    )
    .map((r) => ({
      key: r.cwd,
      label: r.project,
      title: r.cwd,
      tokens: tokensOf(r, includeCache),
      color: "var(--color-data-1)",
    }));
  return (
    <Breakdown
      title="By project"
      nameLabel="Project"
      rows={ranked}
      cap={{ n: TOP_BREAKDOWN_ROWS, noun: "project" }}
    />
  );
}

/** A capped display list: the per-Session table can run to hundreds of rows over all-time, so it shows the
 *  top N by the ACTIVE sort with a "+N more" note — sort-then-cap, so re-sorting by tokens surfaces the
 *  heaviest sessions across all history, not a reshuffle of the most-recent N. */
const TOP_SESSIONS = 25;

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
      className={`whitespace-nowrap pb-1.5 font-normal ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        // Buttons don't inherit text-transform from the uppercase <tr>, so set it here or the
        // sortable headers render mixed-case while the By-project <th>s above stay uppercase.
        className={`inline-flex items-center gap-0.5 uppercase transition-colors hover:text-fg ${
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
 *  model, turns, and tokens. Sortable on every column (client-side via sortSessions), defaulting to most
 *  recent activity first. The Tokens column follows the page's "Include cache" toggle, like the other
 *  breakdowns. Capped to the top N by the active sort with a "+N more" note. */
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
      <table className="w-full table-fixed text-aux">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[16%]" />
          <col className="w-[15%]" />
          <col className="w-[13%]" />
          <col className="w-[12%]" />
          <col className="w-[14%]" />
        </colgroup>
        <thead>
          <tr className="text-label uppercase tracking-wide text-fg-faint">
            <SortHeader
              label="Session"
              column="session"
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
          </tr>
        </thead>
        <tbody>
          {/* Key on the session id (globally unique). */}
          {top.map((r) => (
            <tr key={r.sessionId} className="border-t border-ink-850">
              <td className="py-1 pr-3">
                <span className="block truncate text-fg" title={r.cwd}>
                  {r.title ?? r.project}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-meta text-fg-faint">
                  <span className="truncate">{r.project}</span>
                  <span className="font-mono">{r.sessionId.slice(0, 8)}</span>
                  <CopyButton value={r.sessionId} label="Copy session id" />
                </span>
              </td>
              <td className="py-1 pr-3">
                <span className="flex min-w-0 items-center gap-2">
                  <Swatch color={modelColorOf(r.modelRaw)} />
                  <span className="truncate font-mono text-fg-muted">
                    {r.modelRaw ?? "Unknown"}
                  </span>
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
            </tr>
          ))}
        </tbody>
      </table>
      {rest > 0 && (
        <p className="mt-2 text-meta text-fg-faint">
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
      <p className="text-body">No usage yet.</p>
    </div>
  );
}
