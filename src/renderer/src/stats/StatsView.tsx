import { useEffect, useRef, useState } from "react";
import { OverlayScroll } from "../ui/OverlayScroll";
import {
  type StatsSnapshot,
  type ScanProgress,
  type StatsRange,
  DEFAULT_RANGE,
  emptySnapshot,
  isDayRange,
} from "@shared/stats";
import { formatDayShort } from "@shared/format";
import { Icon } from "../ui/icons";
import { RangeFilter, CacheToggle } from "./shared";
import { OverviewCard } from "./OverviewCard";
import { ModelsCard } from "./ModelsCard";
import { ProjectsCard } from "./ProjectsCard";
import { SessionsCard } from "./SessionsCard";

/** Poll cadences: brisk while the first cold backfill fills in, gentle once caught up so a turn landing
 *  in another Session still shows up without a manual refresh. */
const BACKFILL_POLL_MS = 40;
const WARM_POLL_MS = 1500;

/**
 * The Overall Stats view: a shell around four cards (Overview, Models, Projects, Sessions), plus the
 * header's range/cache controls and a "building history" progress banner on a first cold run. Polls
 * stats:read while mounted — each poll runs one bounded scan step in the main process — fast until the
 * backfill is done, then at the warm cadence so turns from other Sessions appear on their own. The effect's
 * cleanup stops the poll on unmount, so selecting any Session ends all scan work; the main process does
 * nothing unprompted.
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

  // Track what last drove the poll effect, so the snapshot blanks only on a range change — never
  // on a calendar-year change, which re-queries just the heatmap and would otherwise flash the whole view.
  const prevRangeRef = useRef(range);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    tokenRef.current = undefined; // new range/year: force a full snapshot on the next poll
    // Blank the cards back to loading rather than show the prior range's totals under the newly-pressed
    // button — but ONLY when the range changed, never on a calendar-year change. The year is independent
    // of the page totals (it re-queries just the heatmap), so blanking everything would flash the whole
    // view for a calendar-only change. Also skip when drilling into a day from the calendar: blanking
    // would unmount the calendar and re-fire its scroll-to-newest effect, flashing away from the cell.
    const rangeChanged = prevRangeRef.current !== range;
    prevRangeRef.current = range;
    if (rangeChanged && !isDayRange(range)) setSnap(null);

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
        </div>
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
                <ProjectsCard
                  rows={snap.byProject}
                  includeCache={includeCache}
                />
                <SessionsCard
                  rows={snap.bySession}
                  includeCache={includeCache}
                />
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

function EmptyStats() {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-24 text-fg-faint">
      <Icon name="chart-column" size={28} />
      <p className="text-body">No usage yet.</p>
    </div>
  );
}
