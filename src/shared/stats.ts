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
 * it (e.g. "claude-opus-4-8"), so one model version is distinct from the next. `totalTokens` is the sum of
 * all four token kinds — the figure the table's Tokens column shows. The donut sizes on `inputTokens +
 * outputTokens` instead: cache-read volume dwarfs fresh tokens in agentic use, so sizing the chart on the
 * total would let a heavily-cached model swamp it. `equivApiValueUsd` is null when the raw id matches no
 * known family: an honest n/a, never a guessed $0. A null `modelRaw` is a turn that recorded no model; it
 * renders as "Unknown" with n/a cost.
 */
export interface StatsByModel {
  modelRaw: string | null;
  totalTokens: number;
  /** Input and output tokens (cache excluded) — the donut's slice weight, kept apart from totalTokens so
   *  cache-read volume can't inflate a model's share. */
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
  equivApiValueUsd: number | null;
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
}

/** Empty breakdowns: the per-read error fallback (main) and the building block for emptySnapshot, so the
 *  "serve none" shape lives in one place. */
export function emptyBreakdowns(): StatsBreakdowns {
  return { byModel: [], byProject: [], byBranch: [] };
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
