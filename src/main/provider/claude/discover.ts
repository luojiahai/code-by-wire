import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PersistedSession, SessionCandidate } from "@shared/types";
import { normalizeModelId } from "@shared/models";
import { projectFromCwd } from "../../project-name";
import {
  parseTranscript,
  transcriptSessionKind,
  type TranscriptSummary,
} from "./transcript";
import { deriveSessionState } from "./state";

export interface RawSessionFile {
  pid: number;
  sessionId: string;
  cwd: string;
  status?: string;
  updatedAt?: number;
  /** "interactive" | "bg" from the registry; absent on files that predate the field. */
  kind?: string;
  /** Present only on background sessions (agent view / `claude --bg`); the agent-view short id. */
  jobId?: string;
}

export interface CandidateDeps {
  claudeDir: string;
  isPidAlive: (pid: number) => boolean;
  /** Wall-clock (ms) for the recency cut. Injected so tests are deterministic. */
  now: number;
  /** How far back (ms) a transcript-only (Ended) session still counts as recent. */
  recentWindowMs: number;
}

/**
 * List an index root (`sessions/` or `projects/`), treating a genuinely-absent one as empty. A
 * missing dir (ENOENT) or a non-dir in its place (ENOTDIR) really is "nothing here". But a real read
 * failure (EACCES, EIO, ELOOP, …) is NOT emptiness — swallowing it would let one unreadable sweep
 * masquerade as an empty home, which downstream prunes the whole index. Let those propagate so the
 * sync aborts and leaves the existing rows intact.
 */
export function readRoot(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
}

/** List a single project subdir, skipping it whole if it can't be read — one bad dir among many
 *  shouldn't sink the sweep (unlike an unreadable root, which `readRoot` surfaces). */
function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Read every well-formed `sessions/*.json`, skipping malformed files. */
export function readSessionFiles(claudeDir: string): RawSessionFile[] {
  const dir = join(claudeDir, "sessions");

  const out: RawSessionFile[] = [];
  for (const name of readRoot(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const j = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (
        typeof j.pid === "number" &&
        j.pid > 0 &&
        typeof j.sessionId === "string"
      ) {
        out.push({
          pid: j.pid,
          sessionId: j.sessionId,
          cwd: typeof j.cwd === "string" ? j.cwd : "",
          status: j.status,
          updatedAt: j.updatedAt,
          kind: typeof j.kind === "string" ? j.kind : undefined,
          jobId: typeof j.jobId === "string" ? j.jobId : undefined,
        });
      }
    } catch {
      // skip malformed session file
    }
  }
  return out;
}

/**
 * Map every transcript to its id and mtime in one sweep of `projects/`, so discovery is O(files)
 * instead of the skeleton's O(sessions × projectDirs) existsSync probe per session. The filename is
 * the session id (`<sessionId>.jsonl`); if an id appears under two project dirs, the freshest wins.
 */
export function indexTranscripts(
  claudeDir: string,
): Map<string, { path: string; mtimeMs: number }> {
  const root = join(claudeDir, "projects");
  const out = new Map<string, { path: string; mtimeMs: number }>();
  for (const proj of readRoot(root)) {
    const dir = join(root, proj);
    for (const name of safeReaddir(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const id = name.slice(0, -".jsonl".length);
      const path = join(dir, name);
      let mtimeMs: number;
      try {
        mtimeMs = statSync(path).mtimeMs;
      } catch {
        continue;
      }
      const prev = out.get(id);
      if (!prev || mtimeMs > prev.mtimeMs) out.set(id, { path, mtimeMs });
    }
  }
  return out;
}

/** Freshest registry file per session id (max updatedAt), so a stale re-registered file can't win. */
export function registryById(claudeDir: string): Map<string, RawSessionFile> {
  const byId = new Map<string, RawSessionFile>();
  for (const s of readSessionFiles(claudeDir)) {
    const prev = byId.get(s.sessionId);
    if (!prev || (s.updatedAt ?? 0) >= (prev.updatedAt ?? 0))
      byId.set(s.sessionId, s);
  }
  return byId;
}

/**
 * A live background session — agent view, `/bg`, or `claude --bg` — recognized from its registry
 * entry. Claude Code hosts these under a supervisor and tags them `kind:"bg"` (always paired with a
 * `jobId`). They are not interactive conversations, so they stay out of the session list. We trigger
 * only on a positive bg signal: a registry file with no `kind` and no `jobId` predates the field and
 * is treated as interactive.
 *
 * This reads the live registry entry only, which Claude reaps when the job ends. A finished bg session
 * is caught instead on its transcript's `sessionKind:"bg"` (see the reaped-bg check in listCandidates):
 * a transcript-only candidate is NOT always a genuine Ended session, because bg sessions write
 * transcripts too.
 */
function isBackground(raw: RawSessionFile | undefined): boolean {
  if (!raw) return false;
  return raw.kind === "bg" || (raw.jobId !== undefined && raw.jobId !== "");
}

/**
 * The sessions worth indexing this pass: every registry entry (live or just-reaped), plus every
 * transcript touched within the recency window — a recent Ended session whose registry file Claude
 * already swept. Cheap by design: no transcript is parsed here. That's `summarize`, which the sync
 * calls only for what actually changed. A transcript older than the window with no registry entry is
 * dropped, which is what keeps the 411MB of ancient transcripts out of the index.
 */
export function listCandidates({
  claudeDir,
  isPidAlive,
  now,
  recentWindowMs,
}: CandidateDeps): SessionCandidate[] {
  const registry = registryById(claudeDir);
  const transcripts = indexTranscripts(claudeDir);
  const cutoff = now - recentWindowMs;

  const ids = new Set<string>(registry.keys());
  for (const [id, t] of transcripts) {
    if (t.mtimeMs >= cutoff) ids.add(id);
  }

  const out: SessionCandidate[] = [];
  for (const id of ids) {
    const raw = registry.get(id);
    if (isBackground(raw)) continue; // hide live Claude background sessions; see isBackground
    const t = transcripts.get(id);
    // Reaped bg: its registry file is gone, but the transcript still reports sessionKind:"bg" (#158).
    // Only scan a transcript-only candidate — a registered non-bg session is genuinely interactive, so
    // it needs no read.
    if (!raw && t && transcriptSessionKind(t.path) === "bg") continue;
    out.push({
      id,
      alive: raw ? isPidAlive(raw.pid) : false,
      status: raw?.status,
      cwd: raw?.cwd ?? "",
      transcriptPath: t?.path,
      transcriptMtimeMs: t?.mtimeMs ?? 0,
      updatedAt: raw?.updatedAt,
    });
  }
  return out;
}

/**
 * Parse a candidate's transcript into a full snapshot. The expensive step — the sync calls it only
 * for a new or changed transcript. A missing or unreadable transcript degrades to registry fallbacks
 * (basename title, updatedAt), so one bad file never sinks the list.
 */
export function summarize(c: SessionCandidate): PersistedSession {
  let t: TranscriptSummary | null = null;
  if (c.transcriptPath) {
    try {
      t = parseTranscript(readFileSync(c.transcriptPath, "utf8"), c.cwd);
    } catch {
      t = null;
    }
  }
  const fallbackName = projectFromCwd(c.cwd);
  const model = t ? t.model : normalizeModelId(undefined);
  const awaitingUser = t?.awaitingUser ?? false;

  return {
    id: c.id,
    title: t?.title ?? fallbackName,
    project: t?.project ?? fallbackName,
    branch: t?.branch,
    state: deriveSessionState({
      alive: c.alive,
      status: c.status,
      awaitingUser,
    }),
    management: "observed", // default; overridden to 'managed' in createClaudeProvider for app-spawned ids
    model,
    modelRaw: t?.modelRaw,
    lastActivityMs: t?.lastActivityMs || c.updatedAt || 0,
    createdMs: t?.createdMs || c.updatedAt || 0,
    awaitingUser,
    transcriptMtimeMs: c.transcriptMtimeMs,
    usage: t?.usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      cacheCreation5mTokens: 0,
      cacheCreation1hTokens: 0,
    },
    contextTokens: t?.contextTokens ?? 0,
  };
}

/**
 * Refresh only the state of a session whose transcript hasn't changed, from fresh liveness/status —
 * no reparse. This is how a session flips to Ended: its process dies without touching the transcript,
 * so the next sync reuses the stored snapshot but re-derives `state` as ended.
 */
export function restate(
  c: SessionCandidate,
  prev: PersistedSession,
): PersistedSession {
  return {
    ...prev,
    state: deriveSessionState({
      alive: c.alive,
      status: c.status,
      awaitingUser: prev.awaitingUser,
    }),
  };
}
