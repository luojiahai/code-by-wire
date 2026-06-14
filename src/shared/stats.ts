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
 * One row of the per-model breakdown (#111), keyed on the raw model id exactly as the transcript recorded
 * it (e.g. "claude-opus-4-8"), so one model version is distinct from the next. `totalTokens` sums all four
 * token kinds; `inputTokens + outputTokens` is the fresh subset. The donut and the table's Tokens column
 * both follow the page-level "Include cache" toggle (StatsView's `tokensOf`): on by default they read
 * `totalTokens`, so a cache-heavy model can dominate the donut; off they read the fresh subset, which keeps
 * cache-read volume from swamping the chart. `equivApiValueUsd` is null when the raw id matches no known
 * family: an honest n/a, never a guessed $0. A null `modelRaw` is a turn that recorded no model; it renders
 * as "Unknown" with n/a cost.
 */
export interface StatsByModel {
  modelRaw: string | null;
  totalTokens: number;
  /** Input and output tokens (cache excluded): the fresh metric the donut and Tokens column show when the
   *  page's "Include cache" toggle is off, kept apart from totalTokens. Mirrors StatsByProject/StatsByBranch. */
  inputTokens: number;
  outputTokens: number;
  /** Equivalent API value for this model, or null (n/a) when the raw id matches no known family. */
  equivApiValueUsd: number | null;
}

/**
 * One row of the per-project breakdown (#112). The grouping key is the FULL `cwd`, so two repos that share a
 * folder name stay separate rows; `project` is that cwd's basename, the display label. `totalTokens` sums all
 * four token kinds — the bar's length and the table's Tokens column. `equivApiValueUsd` is the project's
 * Equivalent API value summed across its recognized models, or null (n/a) when none of its turns ran a known
 * model — an honest n/a, never a guessed $0. A mixed project shows the sum over only its recognized models,
 * which is exactly its contribution to the grand total.
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
  /** Equivalent API value summed over the project's recognized models, or null (n/a) when it has none. */
  equivApiValueUsd: number | null;
}

/**
 * One row of the per-branch breakdown (#112): a (project, git branch) pair. Keyed on the full `cwd` plus the
 * `branch`, so the same branch name in two projects stays distinct and same-basename projects never merge.
 * `branch` is null when the turn recorded none (it renders as a dash). `totalTokens` and `equivApiValueUsd`
 * mean the same as in StatsByProject.
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
  equivApiValueUsd: number | null;
}

/**
 * One row of the per-Session table (#113): a single Claude Session, keyed on its globally-unique
 * `sessionId` (also the React key). `project` is the basename of `cwd`, the display label; `cwd` rides
 * along to disambiguate two same-basename repos on hover. `modelRaw` is the session's DOMINANT model by
 * total tokens (a session can span models, but the column is singular) — yet `equivApiValueUsd` sums cost
 * across ALL its recognized models, so it reconciles with the grand total exactly like the other
 * breakdowns; it's null (n/a) when none of the session's turns ran a recognized model. `lastActivityMs` is
 * the latest turn's timestamp (the default sort key). `durationMs` is the span from the session's earliest
 * to latest KNOWN-time turn (unknown-time `ts=0` turns are excluded from the earliest bound, so an
 * unparsed timestamp can't stretch it back to the epoch); it's 0 when no turn has a known time, or for a
 * single-turn session. `totalTokens`/`inputTokens`/`outputTokens` follow the same fresh-vs-total split as
 * the other rows so the page cache toggle works here too.
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
  /** Equivalent API value summed over the session's recognized models, or null (n/a) when it has none. */
  equivApiValueUsd: number | null;
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
 * The three per-dimension breakdowns a Stats poll carries, all scoped to the same range as the totals and
 * ordered by tokens descending. Each is empty when there is no store, the scan errors, or the window holds
 * no turns. Grouped into one shape so the store can fold all three from a single scan (readBreakdowns) and
 * the snapshot, that reader, and the empty fallback can never disagree on the field set.
 */
export interface StatsBreakdowns {
  /** The per-model breakdown (#111). */
  byModel: StatsByModel[];
  /** The per-project breakdown (#112), keyed on the full cwd. */
  byProject: StatsByProject[];
  /** The per-branch breakdown (#112), keyed on cwd + branch. */
  byBranch: StatsByBranch[];
  /** The per-Session table rows (#113), one per session, ordered by last activity descending. */
  bySession: StatsBySession[];
}

/** Empty breakdowns: the per-read error fallback (main) and the building block for emptySnapshot, so the
 *  "serve none" shape lives in one place. */
export function emptyBreakdowns(): StatsBreakdowns {
  return { byModel: [], byProject: [], byBranch: [], bySession: [] };
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
}

/** An empty, already-"done" snapshot: the no-store fallback and the renderer's IPC-bridge error state, so
 *  the view shows its empty state rather than spinning on "building history" forever. */
export function emptySnapshot(): StatsSnapshot {
  return {
    totals: emptyTotals(),
    progress: { filesTotal: 0, filesDone: 0, done: true },
    hasAnyTurns: false,
    ...emptyBreakdowns(),
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
