import type { Session, PersistedSession, ModelUsage } from "@shared/types";
import { contextWindowFor, normalizeModelId } from "@shared/models";
import { equivApiValueByModel } from "@shared/usage-by-model";
import type { IndexOverview } from "@shared/ipc";
import { isResumable } from "@shared/resumable";
import { transaction, type SqliteDb } from "./driver";

/** Bump when the schema changes; `migrate` rebuilds the index (a disposable cache) to match. */
const SCHEMA_VERSION = 7;

function userVersion(db: SqliteDb): number {
  return (db.prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;
}

/**
 * Bring the index up to the current schema. The SQLite file is a rebuildable cache (the
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
        model_raw TEXT,
        last_activity_ms INTEGER NOT NULL,
        created_ms INTEGER NOT NULL DEFAULT 0,
        awaiting_user INTEGER NOT NULL DEFAULT 0,
        transcript_mtime_ms INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_5m_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_1h_tokens INTEGER NOT NULL DEFAULT 0,
        usage_by_model TEXT,
        context_tokens INTEGER NOT NULL DEFAULT 0
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }
}

interface Row {
  id: string;
  title: string;
  project: string;
  branch: string | null;
  state: string;
  management: string;
  model: string;
  model_raw: string | null;
  last_activity_ms: number;
  created_ms: number;
  awaiting_user: number;
  transcript_mtime_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cache_creation_5m_tokens: number;
  cache_creation_1h_tokens: number;
  usage_by_model: string | null;
  context_tokens: number;
}

/** Parse the persisted usageByModel JSON column into ModelUsage[], or [] when the column is null (an old
 *  cached row written before the column existed) or the JSON is unreadable. hydrate then synthesizes the
 *  single-entry main-thread fallback, so a pre-column row still renders until the next re-summarize fills
 *  in the real breakdown. */
function parseUsageByModel(json: string | null): ModelUsage[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as ModelUsage[]) : [];
  } catch {
    return [];
  }
}

function rowToPersisted(r: Row): PersistedSession {
  return {
    id: r.id,
    title: r.title,
    project: r.project,
    branch: r.branch ?? undefined,
    state: r.state as PersistedSession["state"],
    management: r.management as PersistedSession["management"],
    model: normalizeModelId(r.model),
    modelRaw: r.model_raw ?? undefined,
    lastActivityMs: r.last_activity_ms,
    createdMs: r.created_ms,
    awaitingUser: !!r.awaiting_user,
    transcriptMtimeMs: r.transcript_mtime_ms,
    usage: {
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cacheReadTokens: r.cache_read_tokens,
      cacheCreationTokens: r.cache_creation_tokens,
      cacheCreation5mTokens: r.cache_creation_5m_tokens,
      cacheCreation1hTokens: r.cache_creation_1h_tokens,
    },
    usageByModel: parseUsageByModel(r.usage_by_model),
    contextTokens: r.context_tokens,
  };
}

/** Context fill as a whole-number percent, capped at 100; 0 when the window is unknown. The cap
 *  guards a model run on a larger window than its family default (e.g. Sonnet on the 1M beta). */
function pctOfWindow(tokens: number, window: number): number {
  return window > 0 ? Math.min(100, Math.round((tokens / window) * 100)) : 0;
}

/**
 * Turn a persisted snapshot into a renderer-facing Session, computing the derived display values
 * (context window, context %, Equivalent API value) from the stored raw numbers + model — the single
 * place those formulas live. The window is a fixed per-family property of the model, so it's derived
 * here, not stored.
 */
export function hydrate(p: PersistedSession): Session {
  const contextWindow = contextWindowFor(p.model);
  // The panel reads usageByModel for everything. A session summarized with the column carries its real
  // per-model breakdown; an old cached row (pre-column) or an empty transcript falls back to a single
  // main-thread entry, so the panel still renders main-only until the next re-summarize. The fallback's
  // modelRaw prefers the stored raw id, else the family alias (which isKnownModelString recognizes), so
  // its Equivalent API value equals the pre-change single-model figure.
  // Fall back to the single-entry main-thread model when usageByModel is absent/empty OR when every
  // entry has a null modelRaw (turns that recorded no model at all): the fallback's modelRaw is always
  // a recognized string, so equivApiValueByModel prices it at the family rate rather than returning $0.
  const models: ModelUsage[] =
    p.usageByModel?.length && p.usageByModel.some((mu) => mu.modelRaw !== null)
      ? p.usageByModel
      : [{ modelRaw: p.modelRaw ?? p.model, usage: p.usage }];
  return {
    id: p.id,
    title: p.title,
    project: p.project,
    branch: p.branch,
    state: p.state,
    management: p.management,
    resumable: isResumable(p.transcriptMtimeMs),
    model: p.model,
    modelRaw: p.modelRaw,
    contextPct: pctOfWindow(p.contextTokens, contextWindow),
    contextWindow,
    usage: p.usage,
    usageByModel: models,
    equivApiValueUsd: equivApiValueByModel(models),
    lastActivityMs: p.lastActivityMs,
    createdMs: p.createdMs,
  };
}

const UPSERT = `
  INSERT INTO sessions
    (id, title, project, branch, state, management, model, model_raw, last_activity_ms, created_ms, awaiting_user, transcript_mtime_ms,
     input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cache_creation_5m_tokens, cache_creation_1h_tokens, usage_by_model, context_tokens)
  VALUES
    (@id, @title, @project, @branch, @state, @management, @model, @model_raw, @last_activity_ms, @created_ms, @awaiting_user, @transcript_mtime_ms,
     @input_tokens, @output_tokens, @cache_read_tokens, @cache_creation_tokens, @cache_creation_5m_tokens, @cache_creation_1h_tokens, @usage_by_model, @context_tokens)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    project = excluded.project,
    branch = excluded.branch,
    state = excluded.state,
    management = excluded.management,
    model = excluded.model,
    model_raw = excluded.model_raw,
    last_activity_ms = excluded.last_activity_ms,
    created_ms = CASE
      WHEN excluded.created_ms = 0 THEN sessions.created_ms
      WHEN sessions.created_ms = 0 THEN excluded.created_ms
      ELSE MIN(sessions.created_ms, excluded.created_ms)
    END,
    awaiting_user = excluded.awaiting_user,
    transcript_mtime_ms = excluded.transcript_mtime_ms,
    input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens,
    cache_read_tokens = excluded.cache_read_tokens,
    cache_creation_tokens = excluded.cache_creation_tokens,
    cache_creation_5m_tokens = excluded.cache_creation_5m_tokens,
    cache_creation_1h_tokens = excluded.cache_creation_1h_tokens,
    usage_by_model = excluded.usage_by_model,
    context_tokens = excluded.context_tokens
`;

/**
 * Upsert snapshots by id: changed rows update in place, new ones insert, the rest are rewritten with
 * identical values (so a no-change pass leaves content untouched). One transaction, so a mid-batch
 * failure leaves the index as it was.
 */
export function upsertSessions(
  db: SqliteDb,
  snapshots: PersistedSession[],
): void {
  const stmt = db.prepare(UPSERT);
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
        model_raw: s.modelRaw ?? null,
        last_activity_ms: s.lastActivityMs,
        created_ms: s.createdMs,
        awaiting_user: s.awaitingUser ? 1 : 0,
        transcript_mtime_ms: s.transcriptMtimeMs,
        input_tokens: s.usage.inputTokens,
        output_tokens: s.usage.outputTokens,
        cache_read_tokens: s.usage.cacheReadTokens,
        cache_creation_tokens: s.usage.cacheCreationTokens,
        cache_creation_5m_tokens: s.usage.cacheCreation5mTokens,
        cache_creation_1h_tokens: s.usage.cacheCreation1hTokens,
        usage_by_model: JSON.stringify(s.usageByModel ?? []),
        context_tokens: s.contextTokens,
      });
    }
  });
}

/** Every persisted snapshot, freshest first. The sync reads this once to learn stored mtimes and to
 *  reuse unchanged snapshots without reparsing. */
export function getPersisted(db: SqliteDb): PersistedSession[] {
  const rows = db
    .prepare("SELECT * FROM sessions ORDER BY last_activity_ms DESC")
    .all() as Row[];
  return rows.map(rowToPersisted);
}

/** The renderer-facing sessions: persisted snapshots hydrated with the derived display values. */
export function getSessions(db: SqliteDb): Session[] {
  return getPersisted(db).map(hydrate);
}

/**
 * The indexed session list from a single index read, so the list the Overview renders reflects one
 * snapshot in one IPC round trip. `getPersisted` reads the SQLite rows, never a transcript.
 */
export function getOverview(db: SqliteDb): IndexOverview {
  const persisted = getPersisted(db);
  // No account here: the SQLite index holds no live statusLine data. ipc.ts overlays the
  // freshest captures and derives the account before serving the renderer (the IndexOverview → OverviewData
  // seam), so the store never ships a half-built account that some other caller could read as real.
  return { sessions: persisted.map(hydrate) };
}

/** A map of session id → stored title, for the stats By-session table to name rows the index knows. Reads
 *  only the two columns the merge needs, so it stays cheap on a large index. */
export function readSessionTitles(db: SqliteDb): Record<string, string> {
  const rows = db.prepare("SELECT id, title FROM sessions").all() as {
    id: string;
    title: string;
  }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.id] = r.title;
  return out;
}

/** Drop every row whose id isn't in `keepIds` — sessions that aged out of the window and aren't live.
 *  An empty keep-set clears the table. */
export function pruneSessions(db: SqliteDb, keepIds: string[]): void {
  if (keepIds.length === 0) {
    db.exec("DELETE FROM sessions");
    return;
  }
  const placeholders = keepIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM sessions WHERE id NOT IN (${placeholders})`).run(
    ...keepIds,
  );
}
