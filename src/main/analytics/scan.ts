import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteDb } from "../db/driver";
import { upsertTurns, type AnalyticsTurn } from "../db/analytics";
import { indexTranscripts } from "../provider/claude/discover";
import { subagentsDirFor } from "../provider/claude/subagents";
import { extractTurns } from "../provider/claude/turns";

/**
 * Ingest every assistant turn from every Transcript on disk into the analytics store. Walks the full
 * projects/ tree via indexTranscripts (which, unlike the live discovery's recency-windowed candidate
 * list, enumerates every transcript regardless of age), so "all-time" genuinely means all-time.
 *
 * Each session's subagent turns live in a sibling `subagents/agent-*.jsonl`, never inline in the parent
 * (the parent only carries the Task dispatch), so a one-level walk would silently drop their real billed
 * usage. We read those too, attributing each to the parent session — a subagent isn't its own session, so
 * this lifts turn and token counts without inventing a phantom session in COUNT(DISTINCT session_id).
 *
 * Slice 1 reads each file whole and upserts by message id (last-write-wins), so a re-run is idempotent.
 * One unreadable transcript is skipped, not fatal (mirrors summarize). Performance and incrementality —
 * appended-line reads, chunked yielding passes, and bounding the all-turns accumulation + single upsert
 * transaction so a long history doesn't spike memory — come in a later slice.
 */
export function scanAllTranscripts(db: SqliteDb, claudeDir: string): void {
  const turns: AnalyticsTurn[] = [];
  for (const [sessionId, { path }] of indexTranscripts(claudeDir)) {
    let jsonl: string;
    try {
      jsonl = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    turns.push(...extractTurns(jsonl, sessionId));
    turns.push(...extractSubagentTurns(path, sessionId));
  }
  upsertTurns(db, turns);
}

/**
 * Every assistant turn from a transcript's `subagents/agent-*.jsonl` files, attributed to the parent
 * session. Each subagent file passes its own surrogate key prefix so an id-less subagent turn can't
 * collide with an id-less parent turn under the same session. A missing dir or one unreadable file is
 * skipped, not fatal — same tolerance as the parent read.
 */
function extractSubagentTurns(
  transcriptPath: string,
  sessionId: string,
): AnalyticsTurn[] {
  const dir = subagentsDirFor(transcriptPath);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: AnalyticsTurn[] = [];
  for (const name of names) {
    if (!name.startsWith("agent-") || !name.endsWith(".jsonl")) continue;
    let jsonl: string;
    try {
      jsonl = readFileSync(join(dir, name), "utf8");
    } catch {
      continue;
    }
    out.push(...extractTurns(jsonl, sessionId, `${sessionId}/${name}`));
  }
  return out;
}
