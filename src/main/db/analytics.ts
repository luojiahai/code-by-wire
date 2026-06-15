import type { Usage } from "@shared/types";
import type {
  StatsTotals,
  StatsByModel,
  StatsByProject,
  StatsByBranch,
  StatsBySession,
  StatsBreakdowns,
  DailyBucket,
  CalendarDay,
  StatsWindow,
} from "@shared/stats";
import { branchRowKey, ALL_TIME } from "@shared/stats";
import {
  equivApiValue,
  isKnownModelString,
  normalizeModelId,
} from "@shared/models";
import { transaction, type SqliteDb } from "./driver";

/**
 * Bump when the turn schema changes. The analytics store is durable: a full disk scan is expensive to
 * redo, so migrate never DROPs a table and a live-index bump (ADR-0002) can't touch this separate file.
 *
 * v2 adds `processed_files` (the incremental high-water marks) and does a ONE-TIME `DELETE FROM turns`.
 * That delete is the single exception to "never lose history on a bump": slice 2 re-keys an id-less
 * turn's surrogate from the parsed-row index to the absolute line number (so an incremental, mid-file
 * parse keys it the same way a full parse does), and the only coherent way to switch schemes is to let
 * the next scan rebuild `turns` from disk. It's a deliberate, related migration — not the unrelated
 * churn the durability rule guards against — and the chunked backfill repopulates within seconds.
 *
 * Critically the delete is scoped to exactly the v1 -> v2 step (`from === 1`), NOT every upgrade: it
 * must never re-run on a future bump, or a later schema change would silently re-wipe a v2+ user's
 * durable history — the precise durability violation this file guards against.
 */
const ANALYTICS_SCHEMA_VERSION = 2;

function userVersion(db: SqliteDb): number {
  return (db.prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;
}

export function migrateAnalytics(db: SqliteDb): void {
  const from = userVersion(db);
  if (from < ANALYTICS_SCHEMA_VERSION) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS turns (
        message_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        ts INTEGER NOT NULL DEFAULT 0,
        model_raw TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        cwd TEXT NOT NULL DEFAULT '',
        project TEXT NOT NULL DEFAULT '',
        branch TEXT
      );
      CREATE INDEX IF NOT EXISTS turns_ts ON turns(ts);
      CREATE INDEX IF NOT EXISTS turns_session ON turns(session_id);
      CREATE INDEX IF NOT EXISTS turns_project ON turns(project);
      CREATE TABLE IF NOT EXISTS processed_files (
        path TEXT PRIMARY KEY,
        mtime REAL NOT NULL,
        lines INTEGER NOT NULL
      );
      ${from === 1 ? "DELETE FROM turns;" : ""}
      PRAGMA user_version = ${ANALYTICS_SCHEMA_VERSION};
    `);
  }
}

/**
 * One assistant turn as the analytics store records it. `cwd` is the full working directory (not just the
 * basename) so later per-project work can keep two same-named repos distinct (#107); `project` is the
 * basename for display. `messageId` is the dedup key — the UNIQUE backstop that makes a re-scan idempotent.
 */
export interface AnalyticsTurn {
  messageId: string;
  sessionId: string;
  ts: number;
  modelRaw?: string;
  usage: Usage;
  cwd: string;
  project: string;
  branch?: string;
}

const UPSERT_TURN = `
  INSERT INTO turns
    (message_id, session_id, ts, model_raw, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cwd, project, branch)
  VALUES
    (@message_id, @session_id, @ts, @model_raw, @input_tokens, @output_tokens, @cache_read_tokens, @cache_creation_tokens, @cwd, @project, @branch)
  ON CONFLICT(message_id) DO UPDATE SET
    session_id = excluded.session_id,
    ts = excluded.ts,
    model_raw = excluded.model_raw,
    input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens,
    cache_read_tokens = excluded.cache_read_tokens,
    cache_creation_tokens = excluded.cache_creation_tokens,
    cwd = excluded.cwd,
    project = excluded.project,
    branch = excluded.branch
`;

/** Upsert turns by message_id: a re-scan rewrites the same rows in place (last-write-wins), so totals
 *  never double-count. One transaction, so a mid-batch failure leaves the store as it was. */
export function upsertTurns(db: SqliteDb, turns: AnalyticsTurn[]): void {
  const stmt = db.prepare(UPSERT_TURN);
  transaction(db, () => {
    for (const t of turns) {
      stmt.run({
        message_id: t.messageId,
        session_id: t.sessionId,
        ts: t.ts,
        model_raw: t.modelRaw ?? null,
        input_tokens: t.usage.inputTokens,
        output_tokens: t.usage.outputTokens,
        cache_read_tokens: t.usage.cacheReadTokens,
        cache_creation_tokens: t.usage.cacheCreationTokens,
        cwd: t.cwd,
        project: t.project,
        branch: t.branch ?? null,
      });
    }
  });
}

/** A file's incremental high-water mark: the mtime at which it was last fully processed (or the partial
 *  sentinel mid-file — see scan.ts), and the count of newline-terminated lines already ingested. */
export interface ProcessedFile {
  mtime: number;
  lines: number;
}

/** Every file's high-water mark, keyed by absolute path. The scanner loads this once per step to decide,
 *  per file, whether to skip (mtime unchanged), read the appended tail (grew), or re-read from zero
 *  (shrank). */
export function readProcessedFiles(db: SqliteDb): Map<string, ProcessedFile> {
  const rows = db
    .prepare("SELECT path, mtime, lines FROM processed_files")
    .all() as { path: string; mtime: number; lines: number }[];
  const out = new Map<string, ProcessedFile>();
  for (const r of rows) out.set(r.path, { mtime: r.mtime, lines: r.lines });
  return out;
}

const UPSERT_PROCESSED = `
  INSERT INTO processed_files (path, mtime, lines)
  VALUES (@path, @mtime, @lines)
  ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime, lines = excluded.lines
`;

/** Record a file's high-water mark after a step: `mtime` is the file's mtime once fully processed, or the
 *  partial sentinel while a very large file is still being consumed in line-bounded chunks. */
export function upsertProcessedFile(
  db: SqliteDb,
  path: string,
  mtime: number,
  lines: number,
): void {
  db.prepare(UPSERT_PROCESSED).run({ path, mtime, lines });
}

interface TotalsRow {
  sessions: number;
  turns: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

interface ModelRow {
  model_raw: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

/** All-zero totals, re-exported from the shared single source so the no-db fallback here and the
 *  renderer's error state share one definition (the zero shape can't drift). */
export { emptyTotals } from "@shared/stats";

/**
 * The windowed WHERE clause + bind params shared by every turn aggregation. `win.sinceMs` is an inclusive
 * lower bound (`ts >= @since`); `win.untilMs` an exclusive upper bound (`ts < @until`); each clause is added
 * only when its bound is set. `requireTs` adds a bare `ts > 0` when NO lower bound is set — the daily/calendar
 * cuts need it so an unknown-time (ts=0) turn never buckets into a 1970 day; the scalar cuts leave it false so
 * all-time still counts those turns (they survive only in all-time — see readTotals).
 */
function tsWindow(
  win: StatsWindow,
  requireTs = false,
): { where: string; bind: Record<string, number>[] } {
  const clauses: string[] = [];
  const params: Record<string, number> = {};
  if (win.sinceMs != null) {
    clauses.push("ts >= @since");
    params.since = win.sinceMs;
  } else if (requireTs) {
    clauses.push("ts > 0");
  }
  if (win.untilMs != null) {
    clauses.push("ts < @until");
    params.until = win.untilMs;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const bind = Object.keys(params).length ? [params] : [];
  return { where, bind };
}

/** The windowed per-model GROUP BY that both the grand totals' cost and the per-model breakdown read from.
 *  Single-sourced so the two can never group differently or fall out of sync. `win.sinceMs` null →
 *  all-time (no lower bound); a number is an inclusive lower bound on ts. `win.untilMs` null → no
 *  upper bound; a number is an exclusive upper bound on ts. */
function groupByModel(db: SqliteDb, win: StatsWindow): ModelRow[] {
  const { where, bind } = tsWindow(win);
  return db
    .prepare(
      `SELECT
         model_raw,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
         COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens
       FROM turns ${where}
       GROUP BY model_raw`,
    )
    .all(...bind) as ModelRow[];
}

/** A grouped row's Equivalent API value, or null (n/a) when its raw id matches no known family. The single
 *  cost mapping the totals and the breakdown share, so a breakdown row's cost is exactly its contribution
 *  to the grand total. Pricing flows through equivApiValue (the per-session Cost panel's formula too), so
 *  the three can't drift. */
function modelRowCost(m: ModelRow): number | null {
  const raw = m.model_raw ?? undefined;
  if (!isKnownModelString(raw)) return null; // n/a cost: the tokens still count toward the token totals
  return equivApiValue(
    {
      inputTokens: m.input_tokens,
      outputTokens: m.output_tokens,
      cacheReadTokens: m.cache_read_tokens,
      cacheCreationTokens: m.cache_creation_tokens,
    },
    normalizeModelId(raw),
  );
}

/**
 * Grand totals from a SQL aggregate, plus the Equivalent API value. The value is summed per raw model id
 * (so each family is priced at its own rates) over only the recognized models, sharing the groupByModel /
 * modelRowCost mapping the per-model breakdown uses so the two can't drift; an unrecognized id still
 * contributes its tokens to the token totals above but n/a cost here. Pricing is single-sourced through
 * equivApiValue (the same formula the per-session Cost panel uses).
 */
export function readTotals(
  db: SqliteDb,
  win: StatsWindow = ALL_TIME,
): StatsTotals {
  // win.sinceMs null → all-time (no bound). A number → an inclusive lower bound on ts (the window's start,
  // computed local-day-aware by the caller via rangeSinceMs). `bind` is spread into get/all: an empty
  // array calls them with no params, a single object binds @since.
  //
  // A turn whose timestamp didn't parse is stored ts=0 (the unknown-time sentinel — see turns.ts). Every
  // windowed bound is a positive epoch, so those turns fall out of dated ranges and survive only in
  // all-time. That's deliberate: a turn with no known time can't honestly be placed in a calendar window
  // (exact data only). The consequence is that all-time can exceed the sum of the windows — by design.
  const { where, bind } = tsWindow(win);

  const t = db
    .prepare(
      `SELECT
         COUNT(DISTINCT session_id) AS sessions,
         COUNT(*) AS turns,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
         COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens
       FROM turns ${where}`,
    )
    .get(...bind) as TotalsRow;

  // Cost is summed per raw model id over the recognized models, single-sourced through the same
  // groupByModel/modelRowCost the per-model breakdown uses — so the headline total and the breakdown rows
  // reconcile by construction. An unrecognized id contributes nothing here; its tokens still count above.
  const equivApiValueUsd = groupByModel(db, win).reduce(
    (acc, m) => acc + (modelRowCost(m) ?? 0),
    0,
  );

  return {
    sessions: t.sessions,
    turns: t.turns,
    inputTokens: t.input_tokens,
    outputTokens: t.output_tokens,
    cacheReadTokens: t.cache_read_tokens,
    cacheCreationTokens: t.cache_creation_tokens,
    equivApiValueUsd,
  };
}

/** Whether the store holds any turn at all, range-independent. Drives the Stats view's empty state so a
 *  scoped range that happens to be empty (e.g. "today" before any activity) shows zeroed cards, not the
 *  "No usage yet" empty state, when history exists outside the window. */
export function hasAnyTurns(db: SqliteDb): boolean {
  const row = db
    .prepare("SELECT EXISTS(SELECT 1 FROM turns) AS present")
    .get() as { present: number };
  return row.present === 1;
}

/**
 * The per-model breakdown (#111): one row per raw model id, scoped to the same range bound the totals use.
 * `totalTokens` sums all four kinds (the table's Tokens column); `inputTokens`/`outputTokens` ride along so
 * the donut can size on fresh tokens alone, since cache-read volume would otherwise swamp it. Cost flows
 * through modelRowCost — the same mapping readTotals sums — so an unrecognized id gets null cost (n/a) while
 * its tokens still count, and the rows reconcile with the grand total. Rows order by total tokens
 * descending, then by raw id so ties stay stable across polls (SQLite's GROUP BY order is otherwise
 * unspecified, which would flicker the donut colors).
 */
export function readByModel(
  db: SqliteDb,
  win: StatsWindow = ALL_TIME,
): StatsByModel[] {
  return foldModels(groupByModel(db, win));
}

/**
 * Fold per-model rows into the per-model breakdown. The input may already be one row per model (groupByModel)
 * or a finer dimension×model scan (readBreakdowns) — either way we re-group by raw id, summing the four token
 * kinds, so the result is identical. The map keys on `model_raw` directly (so a null "Unknown" model and an
 * empty-string id stay distinct buckets, matching SQLite's GROUP BY); cost prices each summed row through
 * modelRowCost (n/a for an unrecognized id). Rows order by total tokens descending, then by raw id so ties
 * stay stable across polls.
 */
function foldModels(rows: ModelRow[]): StatsByModel[] {
  const map = new Map<string | null, ModelRow>();
  for (const r of rows) {
    let m = map.get(r.model_raw);
    if (!m) {
      m = {
        model_raw: r.model_raw,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      };
      map.set(r.model_raw, m);
    }
    m.input_tokens += r.input_tokens;
    m.output_tokens += r.output_tokens;
    m.cache_read_tokens += r.cache_read_tokens;
    m.cache_creation_tokens += r.cache_creation_tokens;
  }
  return [...map.values()]
    .map(
      (m): StatsByModel => ({
        modelRaw: m.model_raw,
        totalTokens:
          m.input_tokens +
          m.output_tokens +
          m.cache_read_tokens +
          m.cache_creation_tokens,
        inputTokens: m.input_tokens,
        outputTokens: m.output_tokens,
        equivApiValueUsd: modelRowCost(m),
      }),
    )
    .sort(
      (a, b) =>
        b.totalTokens - a.totalTokens ||
        (a.modelRaw ?? "").localeCompare(b.modelRaw ?? ""),
    );
}

/**
 * A (dimension × model) aggregate row: the per-model token sums (so each model slice can be priced through
 * modelRowCost) carrying the cwd/project — and, for the branch grouping, the branch — they were grouped
 * under. `branch` is present only when the GROUP BY included it (the per-project read omits it). The grouping
 * key is always the full cwd, never the basename, so same-basename repos stay distinct.
 */
interface DimModelRow extends ModelRow {
  cwd: string;
  project: string;
  branch?: string | null;
}

/**
 * Group turns by a dimension column list PLUS model_raw, range-scoped exactly like groupByModel. The caller
 * folds away the model dimension (summing tokens, pricing each model slice through modelRowCost) to land one
 * row per dimension tuple. `cols` is an internal constant SQL fragment ("cwd, project" / "cwd, project,
 * branch"), never user input — the same trusted-interpolation shape as the `where` bound here and the
 * schema-version exec elsewhere in this file.
 */
function groupByDimsAndModel(
  db: SqliteDb,
  cols: string,
  win: StatsWindow,
): DimModelRow[] {
  const { where, bind } = tsWindow(win);
  return db
    .prepare(
      `SELECT ${cols},
         model_raw,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
         COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens
       FROM turns ${where}
       GROUP BY ${cols}, model_raw`,
    )
    .all(...bind) as DimModelRow[];
}

/** A dimension group mid-fold: tokens summed across its models; cost accumulated over only its recognized
 *  models, tracking `hasKnownCost` so an all-unrecognized group renders n/a rather than a misleading $0. */
interface DimAgg {
  cwd: string;
  project: string;
  branch: string | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  knownCost: number;
  hasKnownCost: boolean;
}

/**
 * Fold (dimension × model) rows into one DimAgg per dimension tuple, `keyOf` picking the tuple. Tokens sum
 * across every model; cost sums modelRowCost over only the recognized ones (an unrecognized model adds its
 * tokens but no cost). This sums the exact same per-model costs readTotals does, just partitioned by
 * dimension — so a breakdown reconciles with the grand total by construction (equivApiValue is linear in
 * tokens, so splitting a model's tokens across groups and summing back is lossless).
 */
function foldByDim(
  rows: DimModelRow[],
  keyOf: (r: DimModelRow) => string,
): DimAgg[] {
  const map = new Map<string, DimAgg>();
  for (const r of rows) {
    const key = keyOf(r);
    let a = map.get(key);
    if (!a) {
      a = {
        cwd: r.cwd,
        project: r.project,
        branch: r.branch ?? null,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        knownCost: 0,
        hasKnownCost: false,
      };
      map.set(key, a);
    }
    a.totalTokens +=
      r.input_tokens +
      r.output_tokens +
      r.cache_read_tokens +
      r.cache_creation_tokens;
    a.inputTokens += r.input_tokens;
    a.outputTokens += r.output_tokens;
    const cost = modelRowCost(r);
    if (cost != null) {
      a.knownCost += cost;
      a.hasKnownCost = true;
    }
  }
  return [...map.values()];
}

/** A folded group's Equivalent API value: the summed cost of its recognized models, or null (n/a) when none
 *  of its turns ran a recognized model — an honest n/a, never a guessed $0 (matching a per-model row). */
function dimCost(a: DimAgg): number | null {
  return a.hasKnownCost ? a.knownCost : null;
}

/** The finest dimension grain: one row per (cwd × project × branch × model). readBreakdowns scans at this
 *  grain once and folds it down to each breakdown, so a poll runs a single GROUP BY instead of one per cut. */
const FINEST_DIMS = "cwd, project, branch";

/**
 * Fold (dimension × model) rows into the per-project breakdown (#112): one row per project, keyed on the FULL
 * cwd so two repos that share a basename stay distinct (`project` is the basename, for display only). The fold
 * works at any grain finer than cwd — readByProject scans "cwd, project", readBreakdowns hands it the finest
 * scan — because folding by cwd collapses the extra columns. Tokens sum across the project's models; cost
 * folds each model slice through modelRowCost and reconciles with the grand total. Rows order by total tokens
 * descending, then by cwd so ties (and same-basename projects) stay stable across polls.
 */
function foldProjects(rows: DimModelRow[]): StatsByProject[] {
  return foldByDim(rows, (r) => r.cwd)
    .map(
      (a): StatsByProject => ({
        cwd: a.cwd,
        project: a.project,
        totalTokens: a.totalTokens,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        equivApiValueUsd: dimCost(a),
      }),
    )
    .sort(
      (a, b) => b.totalTokens - a.totalTokens || a.cwd.localeCompare(b.cwd),
    );
}

/**
 * Fold (dimension × model) rows into the per-branch breakdown (#112): one row per (project, git branch),
 * keyed via branchRowKey on the full cwd plus the branch so the same branch name in two projects stays
 * distinct, same-basename projects don't merge, and a null branch (no ref recorded) gets its own key. Tokens
 * and cost fold exactly as the per-project read. Rows order by total tokens descending, then by cwd then
 * branch for a stable tie order.
 */
function foldBranches(rows: DimModelRow[]): StatsByBranch[] {
  return foldByDim(rows, (r) => branchRowKey(r.cwd, r.branch ?? null))
    .map(
      (a): StatsByBranch => ({
        cwd: a.cwd,
        project: a.project,
        branch: a.branch,
        totalTokens: a.totalTokens,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        equivApiValueUsd: dimCost(a),
      }),
    )
    .sort(
      (a, b) =>
        b.totalTokens - a.totalTokens ||
        a.cwd.localeCompare(b.cwd) ||
        (a.branch ?? "").localeCompare(b.branch ?? ""),
    );
}

export function readByProject(
  db: SqliteDb,
  win: StatsWindow = ALL_TIME,
): StatsByProject[] {
  return foldProjects(groupByDimsAndModel(db, "cwd, project", win));
}

export function readByBranch(
  db: SqliteDb,
  win: StatsWindow = ALL_TIME,
): StatsByBranch[] {
  return foldBranches(groupByDimsAndModel(db, FINEST_DIMS, win));
}

/**
 * A (session × model) aggregate row: per-model token sums (so each model slice can be priced through
 * modelRowCost) plus the session-scoped scalars the per-Session table needs — the earliest KNOWN-time turn
 * (`MIN(NULLIF(ts,0))`, null when the session has no known-time turn), the latest turn (`MAX(ts)`), and the
 * turn count. `project`/`cwd` are constant within a session (the app models a session as one working dir),
 * so the value SQLite picks for these bare columns is well-defined enough.
 */
interface SessionModelRow extends ModelRow {
  session_id: string;
  project: string;
  cwd: string;
  min_ts: number | null;
  max_ts: number;
  turns: number;
}

/**
 * Group turns by (session × model), range-scoped exactly like groupByModel. The session cut can't ride the
 * shared dims scan (readBreakdowns' FINEST_DIMS): it needs the session_id grain plus the per-session time
 * span and turn count, which that scan doesn't carry. `MIN(NULLIF(ts,0))` ignores the unknown-time sentinel
 * so an unparsed timestamp can't drag the span's start to the epoch; `COUNT(*)` still counts those turns.
 */
function groupBySession(db: SqliteDb, win: StatsWindow): SessionModelRow[] {
  const { where, bind } = tsWindow(win);
  return db
    .prepare(
      `SELECT
         session_id,
         project,
         cwd,
         model_raw,
         MIN(NULLIF(ts, 0)) AS min_ts,
         MAX(ts) AS max_ts,
         COUNT(*) AS turns,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
         COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens
       FROM turns ${where}
       GROUP BY session_id, model_raw`,
    )
    .all(...bind) as SessionModelRow[];
}

/** A session mid-fold: tokens and turns summed across its models; the span tracked as earliest-known and
 *  latest; cost accumulated over only the recognized models (hasKnownCost so an all-unrecognized session
 *  renders n/a, not a misleading $0); the dominant model tracked as the running argmax of token volume. */
interface SessionAgg {
  sessionId: string;
  cwd: string;
  project: string;
  earliestMs: number | null;
  lastActivityMs: number;
  turns: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  knownCost: number;
  hasKnownCost: boolean;
  topModel: string | null;
  topModelTokens: number;
}

/**
 * Fold (session × model) rows into the per-Session breakdown: one row per session. Tokens and turns sum
 * across the session's models; the span is the min of the per-model earliest-known timestamps to the max of
 * the latests (a session with no known-time turn gets durationMs 0); cost sums modelRowCost over only the
 * recognized models, reconciling with the grand total since equivApiValue is linear in tokens. The displayed
 * model is the one with the most total tokens, ties broken by raw id so the pick is deterministic across
 * polls. Rows order by last activity descending, then session id for a stable tie order — the table's
 * default ("most recent first") so a non-sorting consumer still gets a sensible order.
 */
function foldSessions(rows: SessionModelRow[]): StatsBySession[] {
  const map = new Map<string, SessionAgg>();
  for (const r of rows) {
    let a = map.get(r.session_id);
    if (!a) {
      a = {
        sessionId: r.session_id,
        cwd: r.cwd,
        project: r.project,
        earliestMs: null,
        lastActivityMs: 0,
        turns: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        knownCost: 0,
        hasKnownCost: false,
        topModel: null,
        topModelTokens: -1,
      };
      map.set(r.session_id, a);
    }
    if (r.min_ts != null) {
      a.earliestMs =
        a.earliestMs == null ? r.min_ts : Math.min(a.earliestMs, r.min_ts);
    }
    a.lastActivityMs = Math.max(a.lastActivityMs, r.max_ts);
    a.turns += r.turns;
    const groupTokens =
      r.input_tokens +
      r.output_tokens +
      r.cache_read_tokens +
      r.cache_creation_tokens;
    a.totalTokens += groupTokens;
    a.inputTokens += r.input_tokens;
    a.outputTokens += r.output_tokens;
    const cost = modelRowCost(r);
    if (cost != null) {
      a.knownCost += cost;
      a.hasKnownCost = true;
    }
    // Dominant model by tokens; on an exact token tie pick the lexicographically smaller raw id so the
    // choice is stable. A null model (the "Unknown" bucket) compares as the empty string, so on a tie it
    // wins over a named model — an extreme edge case (equal tokens, one named one not), deterministic.
    if (
      groupTokens > a.topModelTokens ||
      (groupTokens === a.topModelTokens &&
        (r.model_raw ?? "").localeCompare(a.topModel ?? "") < 0)
    ) {
      a.topModelTokens = groupTokens;
      a.topModel = r.model_raw;
    }
  }
  return [...map.values()]
    .map(
      (a): StatsBySession => ({
        sessionId: a.sessionId,
        cwd: a.cwd,
        project: a.project,
        modelRaw: a.topModel,
        lastActivityMs: a.lastActivityMs,
        durationMs: a.earliestMs == null ? 0 : a.lastActivityMs - a.earliestMs,
        turns: a.turns,
        totalTokens: a.totalTokens,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        equivApiValueUsd: a.hasKnownCost ? a.knownCost : null,
      }),
    )
    .sort(
      (a, b) =>
        b.lastActivityMs - a.lastActivityMs ||
        a.sessionId.localeCompare(b.sessionId),
    );
}

export function readBySession(
  db: SqliteDb,
  win: StatsWindow = ALL_TIME,
): StatsBySession[] {
  return foldSessions(groupBySession(db, win));
}

/**
 * All three per-dimension breakdowns from ONE finest-grain scan, folded three ways. The poll path
 * (stats:read) calls this once instead of running a separate GROUP BY per breakdown: byModel folds the scan
 * by raw id, byProject by cwd, byBranch by cwd+branch. Every fold is lossless — token sums are additive and
 * equivApiValue is linear in tokens — so each breakdown is identical to its standalone readByX and still
 * reconciles with the grand total.
 */
export function readBreakdowns(
  db: SqliteDb,
  win: StatsWindow = ALL_TIME,
): StatsBreakdowns {
  const rows = groupByDimsAndModel(db, FINEST_DIMS, win);
  return {
    byModel: foldModels(rows),
    byProject: foldProjects(rows),
    byBranch: foldBranches(rows),
    // The session cut needs the session grain plus per-session span/count aggregates the dims scan above
    // can't express, so it runs its own GROUP BY rather than folding `rows`.
    bySession: readBySession(db, win),
  };
}

/**
 * A (local-day × model) aggregate row: the per-model token sums carrying the local calendar day they fell
 * on. `day` is SQLite's date(ts/1000,'unixepoch','localtime') — the user's calendar day (#107), the same
 * key the renderer's localDayKey builds.
 */
interface DayModelRow extends ModelRow {
  day: string;
  /** Assistant turns in this (day × model) group — summed per day by the calendar fold (#115); the daily
   *  by-kind fold (#114) ignores it. */
  turns: number;
}

/**
 * Group turns by (local-day × model), range-scoped. Unlike the other cuts this always has a WHERE: a
 * positive `since` already excludes the ts=0 unknown-time sentinel, and all-time adds `ts > 0` explicitly,
 * so a turn with no known time never lands on a calendar day (no 1970 bucket — exact data only). `ts/1000`
 * is integer division to seconds; 'localtime' buckets by the main process's calendar day.
 */
function groupByDayAndModel(db: SqliteDb, win: StatsWindow): DayModelRow[] {
  const { where, bind } = tsWindow(win, true);
  return db
    .prepare(
      `SELECT
         date(ts / 1000, 'unixepoch', 'localtime') AS day,
         model_raw,
         COUNT(*) AS turns,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
         COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens
       FROM turns ${where}
       GROUP BY day, model_raw`,
    )
    .all(...bind) as DayModelRow[];
}

/** A day mid-fold: the four kind sums, plus a model → total-tokens map so the bucket can carry the
 *  per-model breakdown the by-model stacking needs. */
interface DayAgg {
  day: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  models: Map<string | null, number>;
}

/**
 * Fold (day × model) rows into one DailyBucket per local day. The four kind sums accumulate across the
 * day's models; the per-model totals (all four kinds) accumulate into a map, then emit ordered by total
 * tokens descending, ties broken by raw id — the same stable order foldModels uses, so the stacking and
 * its colors don't flicker across polls. Buckets emit ascending by day (string compare on 'YYYY-MM-DD').
 */
function foldDays(rows: DayModelRow[]): DailyBucket[] {
  const map = new Map<string, DayAgg>();
  for (const r of rows) {
    let a = map.get(r.day);
    if (!a) {
      a = {
        day: r.day,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        models: new Map<string | null, number>(),
      };
      map.set(r.day, a);
    }
    a.inputTokens += r.input_tokens;
    a.outputTokens += r.output_tokens;
    a.cacheReadTokens += r.cache_read_tokens;
    a.cacheCreationTokens += r.cache_creation_tokens;
    const modelTotal =
      r.input_tokens +
      r.output_tokens +
      r.cache_read_tokens +
      r.cache_creation_tokens;
    a.models.set(r.model_raw, (a.models.get(r.model_raw) ?? 0) + modelTotal);
  }
  return [...map.values()]
    .map(
      (a): DailyBucket => ({
        day: a.day,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        cacheReadTokens: a.cacheReadTokens,
        cacheCreationTokens: a.cacheCreationTokens,
        byModel: [...a.models.entries()]
          .map(([modelRaw, totalTokens]) => ({ modelRaw, totalTokens }))
          .sort(
            (x, y) =>
              y.totalTokens - x.totalTokens ||
              (x.modelRaw ?? "").localeCompare(y.modelRaw ?? ""),
          ),
      }),
    )
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The daily usage time-series (#114): one bucket per local calendar day in the range, each carrying the
 * four token-kind sums (the default by-kind stacking) and a per-model breakdown (the by-model stacking).
 * Range-scoped like the other reads; unknown-time turns are excluded (see groupByDayAndModel). Sparse —
 * only days with turns — the renderer densifies the contiguous calendar range.
 */
export function readDaily(
  db: SqliteDb,
  win: StatsWindow = ALL_TIME,
): DailyBucket[] {
  return foldDays(groupByDayAndModel(db, win));
}

/** A calendar day mid-fold: turns and tokens summed across the day's models (total plus the fresh input/
 *  output subset, so the renderer can honor the page's "Include cache" pill via tokensOf); cost accumulated
 *  over only its recognized models (tracking hasKnownCost so an all-unrecognized day renders n/a, not $0). */
interface CalAgg {
  day: string;
  turns: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  knownCost: number;
  hasKnownCost: boolean;
}

/**
 * Fold (day × model) rows into one CalendarDay per local day (#115): the day's turn count and total tokens
 * sum across its models; its Equivalent API value sums modelRowCost over only the recognized ones (an
 * unrecognized model adds its tokens but no cost, and a day with no recognized model is honest n/a). The
 * same per-model cost mapping readTotals/readByModel use, so the calendar reconciles with them. Days emit
 * ascending (string compare on 'YYYY-MM-DD').
 */
function foldCalendar(rows: DayModelRow[]): CalendarDay[] {
  const map = new Map<string, CalAgg>();
  for (const r of rows) {
    let a = map.get(r.day);
    if (!a) {
      a = {
        day: r.day,
        turns: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        knownCost: 0,
        hasKnownCost: false,
      };
      map.set(r.day, a);
    }
    a.turns += r.turns;
    a.totalTokens +=
      r.input_tokens +
      r.output_tokens +
      r.cache_read_tokens +
      r.cache_creation_tokens;
    a.inputTokens += r.input_tokens;
    a.outputTokens += r.output_tokens;
    const cost = modelRowCost(r);
    if (cost != null) {
      a.knownCost += cost;
      a.hasKnownCost = true;
    }
  }
  return [...map.values()]
    .map(
      (a): CalendarDay => ({
        day: a.day,
        turns: a.turns,
        totalTokens: a.totalTokens,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        equivApiValueUsd: a.hasKnownCost ? a.knownCost : null,
      }),
    )
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The contributions calendar's per-day metrics (#115) over a bounded window [win.sinceMs, win.untilMs): one row per
 * local calendar day with activity, each carrying turns, total tokens, and Equivalent API value — the three
 * the cell-intensity toggle switches between. Sparse (only days with turns); the renderer densifies the grid.
 * Reuses the daily (day × model) scan, folded for the calendar's three metrics rather than the by-kind split.
 */
export function readCalendar(
  db: SqliteDb,
  win: StatsWindow = ALL_TIME,
): CalendarDay[] {
  return foldCalendar(groupByDayAndModel(db, win));
}

/**
 * The distinct local years that hold any turn (#115), descending — the calendar year switcher's options.
 * Excludes unknown-time (ts=0) turns, which can't honestly be placed in a year (exact data only), so a year
 * is offered only when real activity falls in it. strftime buckets by the main process's local calendar year,
 * the same 'localtime' the daily/calendar cuts use.
 */
export function readCalendarYears(db: SqliteDb): number[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT
         CAST(strftime('%Y', ts / 1000, 'unixepoch', 'localtime') AS INTEGER) AS y
       FROM turns
       WHERE ts > 0
       ORDER BY y DESC`,
    )
    .all() as { y: number }[];
  return rows.map((r) => r.y);
}

/** The largest turns rowid (0 when empty) — an O(1) "has a new turn landed" signal. Turns are insert/upsert
 *  only, so a stable max rowid means the set of turns is unchanged; the IPC layer memoizes the all-time year
 *  scan (a full-table strftime, polled every tick) against it so the gentle poll doesn't rescan for a list
 *  that's all but static. */
export function turnsMaxRowid(db: SqliteDb): number {
  const r = db
    .prepare(`SELECT COALESCE(MAX(rowid), 0) AS r FROM turns`)
    .get() as {
    r: number;
  };
  return r.r;
}
