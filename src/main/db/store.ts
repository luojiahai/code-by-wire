import type { Session, PersistedSession } from '@shared/types'
import { contextWindowFor, equivApiValue, normalizeModelId } from '@shared/models'
import { computeStats, type Stats } from '@shared/stats'
import type { IndexOverview } from '@shared/ipc'
import { transaction, type SqliteDb } from './driver'

/** Bump when the schema changes; `migrate` rebuilds the index (a disposable cache) to match. */
const SCHEMA_VERSION = 3

function userVersion(db: SqliteDb): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
}

/**
 * Bring the index up to the current schema. The SQLite file is a rebuildable cache (ADR-0002: the
 * raw JSONL is the source of truth), so a version bump just drops and recreates — the next sync
 * repopulates from disk. Keyed on PRAGMA user_version so every launch past the first is a no-op.
 */
export function migrate(db: SqliteDb): void {
  if (userVersion(db) < SCHEMA_VERSION) {
    db.exec(`
      DROP TABLE IF EXISTS sessions;
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project TEXT NOT NULL,
        branch TEXT,
        state TEXT NOT NULL,
        management TEXT NOT NULL,
        model TEXT NOT NULL,
        last_activity_ms INTEGER NOT NULL,
        awaiting_user INTEGER NOT NULL DEFAULT 0,
        transcript_mtime_ms INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        context_tokens INTEGER NOT NULL DEFAULT 0
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `)
  }
}

interface Row {
  id: string
  title: string
  project: string
  branch: string | null
  state: string
  management: string
  model: string
  last_activity_ms: number
  awaiting_user: number
  transcript_mtime_ms: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  context_tokens: number
}

function rowToPersisted(r: Row): PersistedSession {
  return {
    id: r.id,
    title: r.title,
    project: r.project,
    branch: r.branch ?? undefined,
    state: r.state as PersistedSession['state'],
    management: r.management as PersistedSession['management'],
    model: normalizeModelId(r.model),
    lastActivityMs: r.last_activity_ms,
    awaitingUser: !!r.awaiting_user,
    transcriptMtimeMs: r.transcript_mtime_ms,
    usage: {
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cacheReadTokens: r.cache_read_tokens,
      cacheCreationTokens: r.cache_creation_tokens,
    },
    contextTokens: r.context_tokens,
  }
}

/** Context fill as a whole-number percent, capped at 100; 0 when the window is unknown. The cap
 *  guards a model run on a larger window than its family default (e.g. Sonnet on the 1M beta). */
function pctOfWindow(tokens: number, window: number): number {
  return window > 0 ? Math.min(100, Math.round((tokens / window) * 100)) : 0
}

/**
 * Turn a persisted snapshot into a renderer-facing Session, computing the derived display values
 * (context window, context %, Equivalent API value) from the stored raw numbers + model — the single
 * place those formulas live. The window is a fixed per-family property of the model, so it's derived
 * here, not stored. Tasks and subagents stay empty until later issues populate them.
 */
export function hydrate(p: PersistedSession): Session {
  const contextWindow = contextWindowFor(p.model)
  return {
    id: p.id,
    title: p.title,
    project: p.project,
    branch: p.branch,
    state: p.state,
    management: p.management,
    model: p.model,
    contextPct: pctOfWindow(p.contextTokens, contextWindow),
    contextWindow,
    usage: p.usage,
    equivApiValueUsd: equivApiValue(p.usage, p.model),
    lastActivityMs: p.lastActivityMs,
    tasks: [],
    subagents: [],
  }
}

const UPSERT = `
  INSERT INTO sessions
    (id, title, project, branch, state, management, model, last_activity_ms, awaiting_user, transcript_mtime_ms,
     input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, context_tokens)
  VALUES
    (@id, @title, @project, @branch, @state, @management, @model, @last_activity_ms, @awaiting_user, @transcript_mtime_ms,
     @input_tokens, @output_tokens, @cache_read_tokens, @cache_creation_tokens, @context_tokens)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    project = excluded.project,
    branch = excluded.branch,
    state = excluded.state,
    management = excluded.management,
    model = excluded.model,
    last_activity_ms = excluded.last_activity_ms,
    awaiting_user = excluded.awaiting_user,
    transcript_mtime_ms = excluded.transcript_mtime_ms,
    input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens,
    cache_read_tokens = excluded.cache_read_tokens,
    cache_creation_tokens = excluded.cache_creation_tokens,
    context_tokens = excluded.context_tokens
`

/**
 * Upsert snapshots by id: changed rows update in place, new ones insert, the rest are rewritten with
 * identical values (so a no-change pass leaves content untouched). One transaction, so a mid-batch
 * failure leaves the index as it was.
 */
export function upsertSessions(db: SqliteDb, snapshots: PersistedSession[]): void {
  const stmt = db.prepare(UPSERT)
  transaction(db, () => {
    for (const s of snapshots) {
      stmt.run({
        id: s.id,
        title: s.title,
        project: s.project,
        branch: s.branch ?? null,
        state: s.state,
        management: s.management,
        model: s.model,
        last_activity_ms: s.lastActivityMs,
        awaiting_user: s.awaitingUser ? 1 : 0,
        transcript_mtime_ms: s.transcriptMtimeMs,
        input_tokens: s.usage.inputTokens,
        output_tokens: s.usage.outputTokens,
        cache_read_tokens: s.usage.cacheReadTokens,
        cache_creation_tokens: s.usage.cacheCreationTokens,
        context_tokens: s.contextTokens,
      })
    }
  })
}

/** Every persisted snapshot, freshest first. The sync reads this once to learn stored mtimes and to
 *  reuse unchanged snapshots without reparsing. */
export function getPersisted(db: SqliteDb): PersistedSession[] {
  const rows = db.prepare('SELECT * FROM sessions ORDER BY last_activity_ms DESC').all() as Row[]
  return rows.map(rowToPersisted)
}

/** The renderer-facing sessions: persisted snapshots hydrated with the derived display values. */
export function getSessions(db: SqliteDb): Session[] {
  return getPersisted(db).map(hydrate)
}

/**
 * The Overview's usage aggregates, computed from the index — `getPersisted` reads the SQLite rows,
 * never a transcript (ADR-0002). `now` is injected so the 7-day trend's day boundaries are
 * deterministic in tests.
 */
export function getStats(db: SqliteDb, now: number): Stats {
  return computeStats(getPersisted(db), now)
}

/**
 * Sessions and usage aggregates from a single index read, so the list the Overview renders and the
 * stats beside it always reflect the same snapshot (and the renderer makes one IPC round trip, not
 * two). One `getPersisted` pass feeds both the hydrate and the fold. `now` is injected for the
 * trend's day boundaries, exactly as `getStats` does.
 */
export function getOverview(db: SqliteDb, now: number): IndexOverview {
  const persisted = getPersisted(db)
  // No account here: the SQLite index holds no live statusLine data (ADR-0002). ipc.ts overlays the
  // freshest captures and derives the account before serving the renderer (the IndexOverview → OverviewData
  // seam), so the store never ships a half-built account that some other caller could read as real.
  return { sessions: persisted.map(hydrate), stats: computeStats(persisted, now) }
}

/** Drop every row whose id isn't in `keepIds` — sessions that aged out of the window and aren't live.
 *  An empty keep-set clears the table. */
export function pruneSessions(db: SqliteDb, keepIds: string[]): void {
  if (keepIds.length === 0) {
    db.exec('DELETE FROM sessions')
    return
  }
  const placeholders = keepIds.map(() => '?').join(',')
  db.prepare(`DELETE FROM sessions WHERE id NOT IN (${placeholders})`).run(...keepIds)
}
