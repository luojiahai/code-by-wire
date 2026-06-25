import { readFileSync, statSync } from "node:fs";
import { transaction, type SqliteDb } from "../db/driver";
import {
  upsertTurns,
  readProcessedFiles,
  upsertProcessedFile,
} from "../db/analytics";
import { indexTranscripts } from "../provider/claude/discover";
import {
  subagentsDirFor,
  listSubagentFiles,
} from "../provider/claude/subagents";
import { extractTurns } from "../provider/claude/turns";
import { planFileScan } from "./incremental";
import type { ScanProgress } from "@shared/stats";

/** mtime stand-in stored for a file that's been only partially consumed (a very large append split across
 *  steps). A real mtimeMs is always positive, so this never collides — and because it never equals the
 *  file's real mtime, the next step re-reads the file and resumes from the stored line count instead of
 *  skipping it. */
const PARTIAL_MTIME = -1;

/** Lines parsed and upserted per step before the caller yields. Bounds how long one synchronous step
 *  holds Electron's main thread, so IPC and pty output keep flowing between steps; it's also the unit a
 *  pathologically large append is split by. */
const DEFAULT_MAX_LINES = 5000;

/** One file the analytics scan ingests: a parent Transcript or one of its subagent files. `keyPrefix`
 *  seeds id-less turns' surrogate keys; a subagent passes its own so an id-less subagent turn can't
 *  collide with an id-less parent turn that shares the session. */
export interface ScanTarget {
  path: string;
  mtimeMs: number;
  sessionId: string;
  keyPrefix: string;
}

/** A briefly-cached target walk: the list and the wall-clock ms it was taken. The handler reuses it across
 *  a rapid backfill burst so `projects/` isn't re-walked ~25×/sec; a warm poll (1500ms apart) always
 *  exceeds the TTL and re-walks fresh, so other sessions' appends still appear promptly. */
export interface WalkCache {
  targets: ScanTarget[];
  atMs: number;
}

/** Return the cached targets when they're younger than `ttlMs`, else re-walk via `walk` and restamp. Pure:
 *  the clock and the walk are injected, so the cache policy is testable without disk or a real timer. */
export function freshTargets(
  cache: WalkCache | null,
  nowMs: number,
  ttlMs: number,
  walk: () => ScanTarget[],
): WalkCache {
  if (cache && nowMs - cache.atMs < ttlMs) return cache;
  return { targets: walk(), atMs: nowMs };
}

/**
 * Every file the analytics scan ingests, with its current mtime — the cheap walk (readdir + stat, no
 * parse). Parent Transcripts come from indexTranscripts (the full, unpruned projects/ sweep, unlike the
 * live discovery's recency-windowed candidate list). Each one's subagent turns live in a sibling
 * subagents/agent-*.jsonl, tracked as their own targets so their mtimes gate them independently of the
 * parent. A missing subagents dir or an unreadable subagent file is skipped, not fatal.
 */
export function collectScanTargets(claudeDir: string): ScanTarget[] {
  const out: ScanTarget[] = [];
  for (const [sessionId, { path, mtimeMs }] of indexTranscripts(claudeDir)) {
    out.push({ path, mtimeMs, sessionId, keyPrefix: sessionId });
    const dir = subagentsDirFor(path);
    for (const { path: subPath, keyPrefix } of listSubagentFiles(
      dir,
      sessionId,
    )) {
      let mtime: number;
      try {
        mtime = statSync(subPath).mtimeMs;
      } catch {
        continue;
      }
      out.push({ path: subPath, mtimeMs: mtime, sessionId, keyPrefix });
    }
  }
  return out;
}

/**
 * One bounded, incremental step of the scan, persisting its own progress so it's resumable across calls
 * (state lives in processed_files, never in memory). Skips every file whose stored mtime still matches —
 * the win that leaves an unchanged ~400MB of ancient Transcripts untouched. For each new/changed file it
 * reads only the lines appended past the stored count (planFileScan), splitting a very large append across
 * steps by `maxLines`; a shrunk file is re-read from zero. Each file's turns and its high-water mark are
 * written in one transaction. A single unreadable file records its mtime (so it stops blocking `done`)
 * and is retried only when its mtime next moves. Returns progress so the caller can show "building
 * history" and know when the backfill is done, plus `wrote`: whether this step upserted any turns. A
 * caller keying a change token off the max turns rowid needs `wrote` because an in-place re-ingest (a
 * shrunk/rewritten file re-read from zero) updates existing rows without moving the rowid.
 */
export function scanStep(
  db: SqliteDb,
  claudeDir: string,
  maxLines: number = DEFAULT_MAX_LINES,
  targets: ScanTarget[] = collectScanTargets(claudeDir),
): ScanProgress & { wrote: boolean } {
  const stored = readProcessedFiles(db);
  const pending = targets
    .filter((t) => stored.get(t.path)?.mtime !== t.mtimeMs)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // Every target already caught up at the start; each pending file we bring current this step adds to it,
  // so we never re-read processed_files or re-filter all targets to learn `filesDone`.
  let filesDone = targets.length - pending.length;
  // Whether this step ingested any turns. A no-turn step (recorded an unreadable/half-written file, or a
  // slice that extracts to nothing) leaves the max rowid put, so the caller's token must lean on this too.
  let wrote = false;

  let budget = maxLines;
  for (const t of pending) {
    if (budget <= 0) break;
    let content: string;
    try {
      content = readFileSync(t.path, "utf8");
    } catch {
      // Unreadable: a chmod-000 file, a directory whose name ends in .jsonl, or a parent deleted since
      // the walk stat'd it. Record its mtime so it stops being pending and `done` can settle — leaving
      // it pending would block convergence forever and pin the poll at the brisk 40ms cadence. A file
      // that's only momentarily locked bumps its mtime on the next write, so it's retried then; a
      // permanently unreadable one stays skipped, which is correct since there's nothing to ingest.
      upsertProcessedFile(
        db,
        t.path,
        t.mtimeMs,
        stored.get(t.path)?.lines ?? 0,
      );
      filesDone++;
      continue;
    }
    const prev = stored.get(t.path);
    const plan = planFileScan(content, prev);
    if (!plan) {
      // No new complete line, but the mtime moved (e.g. only a half-written trailing line grew). Record
      // the current mtime so we don't keep re-reading this file until it grows a complete line.
      upsertProcessedFile(db, t.path, t.mtimeMs, prev?.lines ?? 0);
      filesDone++;
      continue;
    }
    const lines = plan.jsonl.length ? plan.jsonl.split("\n") : [];
    const take = Math.min(lines.length, budget);
    const slice = lines.slice(0, take).join("\n");
    const turns = extractTurns(slice, t.sessionId, t.keyPrefix, plan.startLine);
    if (turns.length) wrote = true;
    const full = take === lines.length;
    transaction(db, () => {
      upsertTurns(db, turns);
      // Commit the file's real mtime only when fully consumed; while a large file is mid-split, store the
      // partial sentinel + the line cursor so the next step resumes here instead of skipping it.
      upsertProcessedFile(
        db,
        t.path,
        full ? t.mtimeMs : PARTIAL_MTIME,
        full ? plan.lines : plan.startLine + take,
      );
    });
    // Fully consumed -> caught up; a mid-split partial keeps the sentinel mtime and stays pending.
    if (full) filesDone++;
    budget -= take;
  }

  return {
    filesTotal: targets.length,
    filesDone,
    done: filesDone === targets.length,
    wrote,
  };
}

/**
 * Drive the incremental scan to completion in one call (unbounded steps). The full-scan convenience the
 * slice-1 integration tests and any non-chunked caller use; production drives scanStep in bounded chunks
 * instead (the Stats view polls it). Idempotent: a re-run skips every unchanged file. The guard is a
 * backstop against a pathological non-converging input — each step makes forward progress (a pending
 * file's high-water mark advances), so it normally exits the moment nothing is pending.
 */
export function scanAllTranscripts(db: SqliteDb, claudeDir: string): void {
  let guard = 0;
  while (!scanStep(db, claudeDir, DEFAULT_MAX_LINES).done) {
    if (++guard > 1_000_000) break;
  }
}
