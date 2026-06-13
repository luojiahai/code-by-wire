/**
 * All-time usage totals the Stats view renders as headline cards, computed by the analytics store from
 * a single SQL aggregate. `equivApiValueUsd` is an Equivalent API value (a reference figure, never money
 * owed on a subscription — see CONTEXT.md): the sum over only the models whose raw id maps to a known
 * family. Tokens from an unrecognized model are still counted in the token totals but contribute n/a cost.
 */
export interface StatsTotals {
  /** Distinct sessions that contributed at least one turn. */
  sessions: number;
  /** Assistant turns ingested. */
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  equivApiValueUsd: number;
}

/** All-zero totals. One definition for the three places that need it: the empty store, the
 *  no-analytics-db fallback (main), and the renderer's error state, so the zero shape can't drift. */
export function emptyTotals(): StatsTotals {
  return {
    sessions: 0,
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    equivApiValueUsd: 0,
  };
}

/**
 * How far the incremental scan has gotten, returned alongside the totals so the Stats view can show a
 * "building history" state on a first cold run and know when to drop from brisk polling to a gentle warm
 * cadence. `filesTotal`/`filesDone` count Transcript and subagent files; `done` is true once every file's
 * high-water mark is current (nothing left to ingest this pass).
 */
export interface ScanProgress {
  filesTotal: number;
  filesDone: number;
  done: boolean;
}

/** One Stats poll: the totals as they stand, how far the scan has gotten, and whether the store holds any
 *  turn at all. */
export interface StatsSnapshot {
  /** Totals scoped to the requested range (all-time when no range bound is applied). */
  totals: StatsTotals;
  progress: ScanProgress;
  /** Whether the store holds any turn at all (range-independent). The empty state keys off this, not the
   *  scoped totals, so picking a range with no turns shows zeroed cards rather than "No usage yet" when
   *  there is history outside the window. */
  hasAnyTurns: boolean;
}

/** An empty, already-"done" snapshot: the no-store fallback and the renderer's IPC-bridge error state, so
 *  the view shows its empty state rather than spinning on "building history" forever. */
export function emptySnapshot(): StatsSnapshot {
  return {
    totals: emptyTotals(),
    progress: { filesTotal: 0, filesDone: 0, done: true },
    hasAnyTurns: false,
  };
}

/** The range the Stats view scopes every total to. `today` is the current local calendar day; `7d`/`30d`/
 *  `90d` are the trailing N local days ending today (inclusive); `all` is all-time, no lower bound. */
export type StatsRange = "today" | "7d" | "30d" | "90d" | "all";

/** The range the page lands on (#107 user story 15): a useful window with no configuration. The IPC
 *  handler's own fallback for a MISSING arg is all-time — show everything rather than silently hide
 *  history — so this 30d default is the product landing the renderer sends on mount, not the handler's
 *  default. */
export const DEFAULT_RANGE: StatsRange = "30d";

/** Trailing-day span per range; a null span (all-time) means no lower bound. */
const RANGE_DAYS: Record<StatsRange, number | null> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

/**
 * The inclusive lower bound (epoch ms) a range scopes to, or null for all-time. Computed against the
 * machine's LOCAL calendar day (the user's today, not UTC — #107): `today` is local midnight today, `7d`
 * local midnight six days earlier, and so on, so each window spans exactly N local days ending today.
 * Date arithmetic via setDate keeps the bound at local midnight across month ends and DST, which pure ms
 * subtraction would drift off. `nowMs` is injected so the boundary is deterministic in tests. An
 * unrecognized range falls back to all-time (null), so a malformed IPC arg never yields a NaN bound.
 */
export function rangeSinceMs(range: StatsRange, nowMs: number): number | null {
  const days = RANGE_DAYS[range];
  if (days == null) return null;
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.getTime();
}
