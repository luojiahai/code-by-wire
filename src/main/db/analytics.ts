import type { Usage } from "@shared/types";
import type { StatsTotals } from "@shared/stats";
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
 * Grand totals from one SQL aggregate, plus the Equivalent API value. The value is summed per raw model id
 * (so each family is priced at its own rates) over only the recognized models; an unrecognized id still
 * contributes its tokens to the token totals above but n/a cost here. Pricing is single-sourced through
 * equivApiValue (the same formula the per-session Cost panel uses), so the two can never drift.
 */
export function readTotals(db: SqliteDb, sinceMs?: number | null): StatsTotals {
  // null/undefined → all-time (no bound). A number → an inclusive lower bound on ts (the window's start,
  // computed local-day-aware by the caller via rangeSinceMs). `bind` is spread into get/all: an empty
  // array calls them with no params, a single object binds @since.
  //
  // A turn whose timestamp didn't parse is stored ts=0 (the unknown-time sentinel — see turns.ts). Every
  // windowed bound is a positive epoch, so those turns fall out of dated ranges and survive only in
  // all-time. That's deliberate: a turn with no known time can't honestly be placed in a calendar window
  // (exact data only). The consequence is that all-time can exceed the sum of the windows — by design.
  const where = sinceMs != null ? "WHERE ts >= @since" : "";
  const bind = sinceMs != null ? [{ since: sinceMs }] : [];

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

  const byModel = db
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

  let equivApiValueUsd = 0;
  for (const m of byModel) {
    const raw = m.model_raw ?? undefined;
    if (!isKnownModelString(raw)) continue; // n/a cost: tokens already counted in the grand totals
    equivApiValueUsd += equivApiValue(
      {
        inputTokens: m.input_tokens,
        outputTokens: m.output_tokens,
        cacheReadTokens: m.cache_read_tokens,
        cacheCreationTokens: m.cache_creation_tokens,
      },
      normalizeModelId(raw),
    );
  }

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
