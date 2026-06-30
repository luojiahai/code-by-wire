/**
 * All-time usage totals the Stats view renders as headline cards, computed by the analytics store from
 * a single SQL aggregate. Tokens from an unrecognized model are still counted in the token totals.
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
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
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
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  };
}

/**
 * One row of the per-model breakdown (#111), keyed on the raw model id exactly as the transcript recorded
 * it (e.g. "claude-opus-4-8"), so one model version is distinct from the next. `totalTokens` sums all four
 * token kinds; `inputTokens + outputTokens` is the fresh subset. The donut and the table's Tokens column
 * both follow the page-level "Include cache" toggle (StatsView's `tokensOf`): on by default they read
 * `totalTokens`, so a cache-heavy model can dominate the donut; off they read the fresh subset, which keeps
 * cache-read volume from swamping the chart. A null `modelRaw` is a turn that recorded no model; it renders
 * as "Unknown".
 */
export interface StatsByModel {
  modelRaw: string | null;
  totalTokens: number;
  /** Input and output tokens (cache excluded): the fresh metric the donut and Tokens column show when the
   *  page's "Include cache" toggle is off, kept apart from totalTokens. Mirrors StatsByProject/StatsByBranch. */
  inputTokens: number;
  outputTokens: number;
}

/**
 * One row of the per-project breakdown (#112). The grouping key is the FULL `cwd`, so two repos that share a
 * folder name stay separate rows; `project` is that cwd's basename, the display label. `totalTokens` sums all
 * four token kinds — the bar's length and the table's Tokens column.
 */
export interface StatsByProject {
  /** The full working directory the turns ran in: the grouping key, kept distinct per repo. The row labels
   *  by `project`; the cwd disambiguates two same-basename projects (the view surfaces it on hover). */
  cwd: string;
  /** The basename of `cwd` — the display label. */
  project: string;
  totalTokens: number;
  /** Input and output tokens (cache excluded), mirroring StatsByModel, so the renderer can show the fresh
   *  metric (input + output) when the page cache toggle is off. */
  inputTokens: number;
  outputTokens: number;
}

/**
 * One row of the per-branch breakdown (#112): a (project, git branch) pair. Keyed on the full `cwd` plus the
 * `branch`, so the same branch name in two projects stays distinct and same-basename projects never merge.
 * `branch` is null when the turn recorded none (it renders as a dash). `totalTokens` means the same as in
 * StatsByProject.
 */
export interface StatsByBranch {
  cwd: string;
  project: string;
  /** The git branch, or null when the turn recorded none. */
  branch: string | null;
  totalTokens: number;
  /** Input and output tokens (cache excluded), mirroring StatsByModel, so the renderer can show the fresh
   *  metric (input + output) when the page cache toggle is off. */
  inputTokens: number;
  outputTokens: number;
}

/**
 * One row of the per-Session table (#113): a single Claude Session, keyed on its globally-unique
 * `sessionId` (also the React key). `project` is the basename of `cwd`, the display label; `cwd` rides
 * along to disambiguate two same-basename repos on hover. `modelRaw` is the session's DOMINANT model by
 * total tokens (a session can span models, but the column is singular). `lastActivityMs` is the latest
 * turn's timestamp (the default sort key). `durationMs` is the span from the session's earliest to latest
 * KNOWN-time turn (unknown-time `ts=0` turns are excluded from the earliest bound, so an unparsed timestamp
 * can't stretch it back to the epoch); it's 0 when no turn has a known time, or for a single-turn session.
 * `totalTokens`/`inputTokens`/`outputTokens` follow the same fresh-vs-total split as the other rows so the
 * page cache toggle works here too.
 */
export interface StatsBySession {
  sessionId: string;
  cwd: string;
  project: string;
  /** The dominant model by tokens (raw id), or null when no turn recorded a model. */
  modelRaw: string | null;
  /** The latest turn's timestamp (epoch ms): "last activity", and the table's default sort key. */
  lastActivityMs: number;
  /** Span from the earliest to the latest known-time turn (ms); 0 when no turn has a known time. */
  durationMs: number;
  /** Assistant turns ingested for this session. */
  turns: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  /** Human-readable session name from the index (derived title or a user rename), merged in at the IPC
   *  handler. Null when the index has no row for this session (reaped / predates the index — the renderer
   *  then falls back to the project basename). */
  title: string | null;
}

/**
 * Overlay human-readable names onto the per-Session rows, mirroring the overview path's precedence
 * (overlaySessions then applyTitleOverrides) so the By-session table shows the same name as the
 * header/rail: a cbw rename wins, then Claude's live session_name, then the index's derived title, else
 * null (the renderer falls back to the project basename). `||`, not `??`, so an empty-string title falls
 * through to the next source instead of blanking the row, matching applyTitleOverrides' truthy check.
 * Pure, so the IPC handler stays thin and this stays unit-testable. A row whose title is unchanged is
 * returned by reference (cheap no-op).
 */
export function withSessionTitles(
  rows: StatsBySession[],
  titleById: Record<string, string>,
  overrides: Record<string, string>,
  liveNames: Record<string, string> = {},
): StatsBySession[] {
  return rows.map((r) => {
    const title =
      overrides[r.sessionId] ||
      liveNames[r.sessionId] ||
      titleById[r.sessionId] ||
      null;
    return title === r.title ? r : { ...r, title };
  });
}

/**
 * The token figure shown for one breakdown row, governed by the page's "Include cache" pill: the full total
 * (all four kinds) when cache is included, or fresh tokens (input + output) when it's off. Read off the
 * { totalTokens, inputTokens, outputTokens } shape every breakdown row carries, so By model / By project /
 * By branch / By session — and the session table's SORT — share one definition and can't drift on what
 * "Tokens" means versus the number on screen.
 */
export function tokensOf(
  row: { totalTokens: number; inputTokens: number; outputTokens: number },
  includeCache: boolean,
): number {
  return includeCache ? row.totalTokens : row.inputTokens + row.outputTokens;
}

/**
 * The stable, collision-free key for a per-branch row: the full `cwd` joined to the branch with a NUL.
 * Neither a path nor a git ref can contain one, so the null-branch sentinel (a turn that recorded no
 * ref) can never collide with a real branch. The store folds branch turns on this key and the renderer
 * keys its React rows on the same string, so one definition keeps the two from drifting apart.
 */
export function branchRowKey(cwd: string, branch: string | null): string {
  return `${cwd}\u0000${branch ?? "\u0000"}`;
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

/**
 * The per-dimension breakdowns a Stats poll carries, all scoped to the same range as the totals and
 * ordered by tokens descending. Each is empty when there is no store, the scan errors, or the window holds
 * no turns. Grouped into one shape so the store can fold byModel and byProject from a single scan
 * (readBreakdowns) and the snapshot, that reader, and the empty fallback can never disagree on the field set.
 */
export interface StatsBreakdowns {
  /** The per-model breakdown (#111). */
  byModel: StatsByModel[];
  /** The per-project breakdown (#112), keyed on the full cwd. */
  byProject: StatsByProject[];
  /** The per-Session table rows (#113), one per session, ordered by last activity descending. */
  bySession: StatsBySession[];
}

/** Empty breakdowns: the per-read error fallback (main) and the building block for emptySnapshot, so the
 *  "serve none" shape lives in one place. */
export function emptyBreakdowns(): StatsBreakdowns {
  return { byModel: [], byProject: [], bySession: [] };
}

/** One Stats poll: the totals as they stand, how far the scan has gotten, whether the store holds any turn
 *  at all, and the per-dimension breakdowns (all range-scoped to the totals). */
export interface StatsSnapshot extends StatsBreakdowns {
  /** Totals scoped to the requested range (all-time when no range bound is applied). */
  totals: StatsTotals;
  progress: ScanProgress;
  /** Whether the store holds any turn at all (range-independent). The empty state keys off this, not the
   *  scoped totals, so picking a range with no turns shows zeroed cards rather than "No usage yet" when
   *  there is history outside the window. */
  hasAnyTurns: boolean;
  /** The daily usage time-series (#114), range-scoped: one sparse bucket per local day with turns,
   *  ascending. The renderer densifies the contiguous calendar range for the chart. */
  daily: DailyBucket[];
  /** The contributions calendar (#115), scoped to its OWN window (trailing twelve months or a selected
   *  year), INDEPENDENT of `range`: the sparse days with activity in that window. */
  calendar: CalendarDay[];
  /** The calendar window's inclusive start day ('YYYY-MM-DD', the day `calendarWindow` resolved), so the
   *  renderer densifies and lays out exactly the queried range. Empty string in the no-store fallback. */
  calendarStart: string;
  /** The calendar window's inclusive end day ('YYYY-MM-DD'); today for the trailing window, Dec 31 for a
   *  selected year. Empty string in the no-store fallback. */
  calendarEnd: string;
  /** The distinct local years that hold any turn, descending — the year switcher's options. */
  calendarYears: number[];
}

/** An empty, already-"done" snapshot: the no-store fallback and the renderer's IPC-bridge error state, so
 *  the view shows its empty state rather than spinning on "building history" forever. */
export function emptySnapshot(): StatsSnapshot {
  return {
    totals: emptyTotals(),
    progress: { filesTotal: 0, filesDone: 0, done: true },
    hasAnyTurns: false,
    daily: [],
    ...emptyBreakdowns(),
    calendar: [],
    calendarStart: "",
    calendarEnd: "",
    calendarYears: [],
  };
}

/** The five trailing-window presets the range filter offers. `today` is the current local calendar day;
 *  `7d`/`30d`/`90d` are the trailing N local days ending today (inclusive); `all` is all-time, no bound. */
export type RangePreset = "today" | "7d" | "30d" | "90d" | "all";

/** The range the Stats view scopes every total to: one of the trailing presets, or a single calendar day
 *  the user drilled into by clicking a contributions-calendar cell (#115). The single-day variant scopes the
 *  page to exactly that local day — the same range mechanism, bounded both ends. */
export type StatsRange = RangePreset | { day: string };

/** The page lands on 30d (#107 user story 15): a useful window with no configuration. The IPC handler's own
 *  fallback for a MISSING arg is all-time; this is the renderer's mount default. */
export const DEFAULT_RANGE: StatsRange = "30d";

/** Whether a range is the single-day drill-down variant (a type guard so callers can read `range.day`). */
export function isDayRange(range: StatsRange): range is { day: string } {
  return typeof range === "object";
}

/** Trailing-day span per preset; a null span (all-time) means no lower bound. */
const RANGE_DAYS: Record<RangePreset, number | null> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

/**
 * The inclusive lower bound (epoch ms) a PRESET range scopes to, or null for all-time. Computed against the
 * machine's LOCAL calendar day (the user's today, not UTC — #107). Date arithmetic via setDate keeps the
 * bound at local midnight across month ends and DST. `nowMs` is injected so the boundary is deterministic in
 * tests. (The single-day variant is resolved by `rangeWindow`, not here.)
 */
export function rangeSinceMs(range: RangePreset, nowMs: number): number | null {
  const days = RANGE_DAYS[range];
  if (days == null) return null;
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.getTime();
}

/** A resolved query window: an inclusive `sinceMs` lower bound and an exclusive `untilMs` upper bound. A null
 *  bound is open (no lower bound = all-time start; no upper bound = open to now). The store's aggregations
 *  filter `ts >= sinceMs AND ts < untilMs`, each clause applied only when its bound is set. */
export interface StatsWindow {
  sinceMs: number | null;
  untilMs: number | null;
}

/** The open window: no bounds, i.e. all-time. The default for every analytics read, so an unscoped call
 *  still means all-time. Frozen and shared — reads only read it, never mutate it. */
export const ALL_TIME: StatsWindow = Object.freeze({
  sinceMs: null,
  untilMs: null,
});

/** Local midnight (epoch ms) for a 'YYYY-MM-DD' key — the day's inclusive lower bound. Built from the key's
 *  parts as a local Date, the same local-day arithmetic rangeSinceMs and addDays use. */
export function dayStartMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/**
 * Resolve a `StatsRange` to a query window. A preset becomes an open-topped window (its `rangeSinceMs` lower
 * bound, no upper bound). A single day becomes a bounded window: [local midnight that day, local midnight the
 * next day) — so the whole page scopes to exactly that calendar day. `nowMs` is injected for determinism;
 * it is used only for a preset (the single-day bounds come from the key, not the clock).
 */
export function rangeWindow(range: StatsRange, nowMs: number): StatsWindow {
  if (isDayRange(range)) {
    return {
      sinceMs: dayStartMs(range.day),
      untilMs: dayStartMs(addDays(range.day, 1)),
    };
  }
  return { sinceMs: rangeSinceMs(range, nowMs), untilMs: null };
}

/** The contributions calendar's resolved window (#115): the inclusive local-day span [startDay, endDay] it
 *  renders, plus the epoch bounds the store queries ([sinceMs, untilMs)). Independent of the page range. */
export interface CalendarWindow {
  startDay: string;
  endDay: string;
  sinceMs: number;
  untilMs: number;
}

/**
 * Resolve the calendar's window. A null year is the default trailing twelve months: the 365 inclusive local
 * days ending today. A specific year runs Jan 1 through Dec 31 of that local year, but never past today — the
 * current year ends at today rather than padding the grid with empty future months (which would scroll the
 * view to a blank December). A past year is unaffected; a future year can't reach the switcher (years come
 * from real data). Either way the epoch bounds are local-midnight aligned (since = startDay's midnight,
 * until = the day after endDay's midnight). `nowMs` is injected so the bounds are deterministic in tests.
 */
export function calendarWindow(
  year: number | null,
  nowMs: number,
): CalendarWindow {
  const today = localDayKey(nowMs);
  const yearEnd = year == null ? today : `${year}-12-31`;
  const endDay = yearEnd < today ? yearEnd : today;
  const startDay = year == null ? addDays(endDay, -364) : `${year}-01-01`;
  return {
    startDay,
    endDay,
    sinceMs: dayStartMs(startDay),
    untilMs: dayStartMs(addDays(endDay, 1)),
  };
}

/**
 * One local calendar day of the daily usage time-series (#114). `day` is the local-day key
 * 'YYYY-MM-DD' — the same string SQLite's date(ts/1000,'unixepoch','localtime') produces — so the
 * renderer's contiguous axis lines up with the store's sparse buckets. The four token-kind sums drive
 * the default by-kind stacking; `byModel` (raw id → total tokens that day, ordered by tokens desc) drives
 * the by-model stacking. Both partition the same tokens, so a day's grand total is identical either way.
 */
export interface DailyBucket {
  /** Local calendar day, 'YYYY-MM-DD'. */
  day: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
  /** Total tokens (all four kinds) per raw model id active this day, ordered by tokens descending then
   *  raw id. A turn that recorded no model uses modelRaw null. Empty on a zero-fill day. */
  byModel: {
    modelRaw: string | null;
    totalTokens: number;
  }[];
}

/**
 * One local calendar day of the contributions calendar (#115), carrying the toggle metrics so the cell
 * intensity can switch between them with no re-fetch. `turns` is the day's assistant-turn count.
 * `totalTokens` sums all four token kinds; `inputTokens`/`outputTokens` ride along so the page's "Include
 * cache" pill can pick the Tokens metric via the shared `tokensOf` (all four kinds on, fresh input+output
 * off), exactly like the per-model/-project/-branch/-session rows.
 */
export interface CalendarDay {
  day: string;
  turns: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
}

/** A zero-usage day bucket: the gap-fill the renderer inserts for a calendar day with no turns, and the
 *  shared empty shape so the zero bucket can't drift from DailyBucket's field set. */
export function emptyDay(day: string): DailyBucket {
  return {
    day,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
    byModel: [],
  };
}

/**
 * The local calendar day key ('YYYY-MM-DD') for an epoch-ms instant in the machine's local time — the
 * same day SQLite's date(ts/1000,'unixepoch','localtime') assigns that turn (#107 local-day bucketing),
 * so the renderer's contiguous day axis aligns with the store's sparse buckets.
 */
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The local day `n` days after `day` (negative walks back), as a 'YYYY-MM-DD' key. Builds a local-midnight
 * Date from the key's parts and steps with setDate, so it crosses month ends, year ends, and DST cleanly —
 * the same local-Date arithmetic rangeSinceMs uses for its bound.
 */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return localDayKey(dt.getTime());
}

/**
 * Fill a sparse, ascending list of daily buckets into a contiguous run from `startDay` to `endDay`
 * inclusive, inserting a zero bucket for every calendar day with no turns — so the chart draws one bar per
 * day across the range and a gap reads as a gap, not a compressed axis. Buckets outside [startDay, endDay]
 * are dropped; an empty range (start after end) yields []. The loop is bounded defensively so a malformed
 * key can't spin forever.
 */
export function densifyDays(
  sparse: DailyBucket[],
  startDay: string,
  endDay: string,
): DailyBucket[] {
  if (startDay > endDay) return [];
  const bySparse = new Map(sparse.map((b) => [b.day, b]));
  const out: DailyBucket[] = [];
  let day = startDay;
  // ~27 years of days: far above any real range, a backstop against a bad key, never reached in practice.
  for (let i = 0; i < 10_000 && day <= endDay; i++) {
    out.push(bySparse.get(day) ?? emptyDay(day));
    day = addDays(day, 1);
  }
  return out;
}
