import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SessionCandidate } from "@shared/types";

/** Mirrors the Claude provider's recency default (Claude Code's own 30-day cleanupPeriodDays). */
export const DEFAULT_RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How fresh (ms) a rollout's mtime must be to call its session live. Codex has no pid registry like
 * Claude's sessions/*.json, so appending-recently is the only liveness signal on disk: a session
 * generating or streaming touches its rollout every few seconds, while a finished one stops cold.
 * 60s absorbs a long tool call's quiet stretch without keeping ended sessions "live" for long.
 */
export const DEFAULT_LIVE_WINDOW_MS = 60_000;

/** The liveness heuristic in one place (see DEFAULT_LIVE_WINDOW_MS for the rationale). */
export function isRolloutLive(
  mtimeMs: number,
  nowMs: number,
  liveWindowMs = DEFAULT_LIVE_WINDOW_MS,
): boolean {
  return nowMs - mtimeMs < liveWindowMs;
}

/** `rollout-<timestamp>-<uuid>.jsonl` — the uuid is the session id. */
const ROLLOUT_RE =
  /^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

/**
 * List a directory level of the sessions tree, treating a genuinely-absent one as empty. Same
 * posture as the Claude provider's readRoot: ENOENT/ENOTDIR really is "nothing here" (no ~/.codex →
 * zero sessions, zero errors), but a real read failure (EACCES, EIO) must propagate — swallowing it
 * would let one unreadable sweep read as an empty home, which downstream prunes the whole index.
 */
function readDirOrEmpty(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
}

/** Slack added to the day-directory prefilter: dir names are the session's *local* start date while
 *  the cutoff is epoch math, and a session keeps appending past the day it started. 48h covers any
 *  timezone offset plus a session that ran across midnight. */
const DAY_DIR_SLACK_MS = 48 * 60 * 60 * 1000;

/**
 * Map every recent rollout to its session id and mtime. Bounded by construction: the tree is
 * `sessions/YYYY/MM/DD/rollout-*.jsonl` (this machine holds ~18k files across months), so whole day
 * directories older than the window are skipped by their *name* — no readdir, no stat — and only
 * files inside recent days are statted, with the mtime as the real cut. The accepted residual: a
 * live session started before the window (its rollout sits in a pruned day dir) won't surface;
 * with no pid registry to vouch for it, unbounded walking would be the only alternative.
 * If an id somehow appears twice, the freshest wins (mirrors the Claude sweep).
 */
export function indexRollouts(
  codexDir: string,
  nowMs: number,
  recentWindowMs: number,
): Map<string, { path: string; mtimeMs: number }> {
  const root = join(codexDir, "sessions");
  const cutoffMs = nowMs - recentWindowMs;
  const out = new Map<string, { path: string; mtimeMs: number }>();
  for (const year of readDirOrEmpty(root)) {
    if (!/^\d{4}$/.test(year)) continue;
    for (const month of readDirOrEmpty(join(root, year))) {
      if (!/^\d{2}$/.test(month)) continue;
      for (const day of readDirOrEmpty(join(root, year, month))) {
        if (!/^\d{2}$/.test(day)) continue;
        const dayStartMs = Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
        );
        if (dayStartMs + DAY_DIR_SLACK_MS < cutoffMs) continue; // whole day predates the window
        const dir = join(root, year, month, day);
        for (const name of readDirOrEmpty(dir)) {
          const m = ROLLOUT_RE.exec(name);
          if (!m) continue;
          const id = m[1];
          const path = join(dir, name);
          let mtimeMs: number;
          try {
            mtimeMs = statSync(path).mtimeMs;
          } catch {
            continue; // vanished between readdir and stat
          }
          if (mtimeMs < cutoffMs) continue; // day dir is recent but this file aged out
          const prev = out.get(id);
          if (!prev || mtimeMs > prev.mtimeMs) out.set(id, { path, mtimeMs });
        }
      }
    }
  }
  return out;
}

/** How much of session_index.jsonl's tail we read for titles. The file is append-only, one JSON
 *  object per line, and later entries are fresher — so the newest ~512KiB of lines covers every
 *  session inside any realistic recency window without ever reading a multi-MB history whole. */
const INDEX_TAIL_BYTES = 512 * 1024;

/**
 * Session id → thread_name from `session_index.jsonl`, tail-read. Reads at most the last
 * INDEX_TAIL_BYTES: when the file is larger, the read starts mid-file and the first (possibly
 * partial) line is dropped. Later entries overwrite earlier ones, so a renamed thread resolves to
 * its newest name. Any failure — missing file, unreadable, malformed lines — degrades to fewer
 * titles, never an error: titles are garnish, the rollout's own first prompt is the fallback.
 */
export function readIndexTitles(
  codexDir: string,
  maxBytes = INDEX_TAIL_BYTES,
): Map<string, string> {
  const out = new Map<string, string>();
  const path = join(codexDir, "session_index.jsonl");
  let text: string;
  try {
    const size = statSync(path).size;
    const start = Math.max(0, size - maxBytes);
    const fd = openSync(path, "r");
    try {
      const buf = Buffer.allocUnsafe(Math.min(size, maxBytes));
      let filled = 0;
      while (filled < buf.length) {
        // Drain short reads (network filesystems) at explicit offsets, like transcriptSessionKind.
        const bytes = readSync(
          fd,
          buf,
          filled,
          buf.length - filled,
          start + filled,
        );
        if (bytes === 0) break;
        filled += bytes;
      }
      text = buf.toString("utf8", 0, filled);
    } finally {
      closeSync(fd);
    }
    // A mid-file start almost certainly lands inside a line; drop up to the first newline so the
    // parser only ever sees whole lines.
    if (start > 0) text = text.slice(text.indexOf("\n") + 1);
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const j = JSON.parse(trimmed);
      if (typeof j.id === "string" && typeof j.thread_name === "string")
        out.set(j.id, j.thread_name);
    } catch {
      // skip a malformed line
    }
  }
  return out;
}

export interface CodexCandidateDeps {
  codexDir: string;
  /** Wall-clock (ms) for the recency cut and the liveness window. Injected so tests are deterministic. */
  now: number;
  recentWindowMs: number;
  liveWindowMs: number;
}

/**
 * The Codex sessions worth indexing this pass: every rollout touched within the recency window.
 * Cheap by design (a bounded readdir+stat walk, no rollout parsed — that's summarize, which the
 * sync calls only for changed files). `alive` is the mtime-freshness heuristic; cwd stays "" until
 * the parse resolves session_meta.
 */
export function listCodexCandidates({
  codexDir,
  now,
  recentWindowMs,
  liveWindowMs,
}: CodexCandidateDeps): SessionCandidate[] {
  const out: SessionCandidate[] = [];
  for (const [id, t] of indexRollouts(codexDir, now, recentWindowMs)) {
    out.push({
      id,
      alive: isRolloutLive(t.mtimeMs, now, liveWindowMs),
      cwd: "",
      transcriptPath: t.path,
      transcriptMtimeMs: t.mtimeMs,
      // The mtime doubles as the activity fallback for a rollout whose rows carry no parseable
      // timestamp (summarize prefers the rows' own timestamps when they exist).
      updatedAt: Math.round(t.mtimeMs),
    });
  }
  return out;
}
