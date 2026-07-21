import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { ScanProgress } from "@shared/stats";
import type { AnalyticsTurn } from "../db/analytics";
import {
  readProcessedFiles,
  upsertProcessedFile,
  upsertTurns,
} from "../db/analytics";
import { transaction, type SqliteDb } from "../db/driver";
import {
  asRecord,
  listRollouts,
  readRolloutHead,
} from "../provider/codex/rollout";
import {
  ZERO_TOTALS,
  deltaTotals,
  readTokenUsage,
  totalsAreZero,
  totalsToUsage,
} from "../provider/codex/token-math";
import type { ScanTarget } from "./scan";

const DEFAULT_MAX_LINES = 5000;

/** The cheap rollout walk projected into the analytics scanner's shared target shape. */
export function collectCodexScanTargets(codexDir: string): ScanTarget[] {
  return listRollouts(codexDir).map((rollout) => ({
    path: rollout.path,
    mtimeMs: rollout.mtimeMs,
    sessionId: rollout.id,
    keyPrefix: `codex:${rollout.id}`,
  }));
}

/**
 * Project a complete Codex rollout into one analytics row per non-zero cumulative token delta.
 * Absolute 0-based line numbers make whole-file re-parses idempotent. Malformed rows, rate-limit-only
 * token_count events, and events without total_token_usage are ignored; an unparseable timestamp uses
 * the same ts=0 unknown-time sentinel as Claude analytics.
 */
export function extractCodexTurns(
  jsonl: string,
  sessionId: string,
  keyPrefix: string,
  cwd: string,
): AnalyticsTurn[] {
  let previous = ZERO_TOTALS;
  let modelRaw: string | undefined;
  const turns: AnalyticsTurn[] = [];

  jsonl.split("\n").forEach((line, lineNumber) => {
    if (!line.trim()) return;
    let row: Record<string, unknown> | null;
    try {
      row = asRecord(JSON.parse(line));
    } catch {
      return;
    }
    if (!row) return;
    const payload = asRecord(row.payload);
    if (!payload) return;

    if (row.type === "turn_context") {
      if (typeof payload.model === "string" && payload.model)
        modelRaw = payload.model;
      return;
    }

    if (row.type !== "event_msg" || payload.type !== "token_count") return;
    const info = asRecord(payload.info);
    if (!info) return;
    const totalRaw = asRecord(info.total_token_usage);
    if (!totalRaw) return;

    const totals = readTokenUsage(totalRaw);
    const delta = deltaTotals(previous, totals);
    previous = totals;
    if (totalsAreZero(delta)) return;

    const eventModel = info.model ?? info.model_name;
    const model =
      modelRaw ??
      (typeof eventModel === "string" && eventModel ? eventModel : undefined);
    const parsedTs =
      typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    turns.push({
      messageId: `${keyPrefix}:${lineNumber}`,
      sessionId,
      agent: "codex",
      ts: Number.isFinite(parsedTs) ? parsedTs : 0,
      modelRaw: model,
      usage: totalsToUsage(delta),
      cwd,
      project: cwd ? basename(cwd) : "",
    });
  });

  return turns;
}

/**
 * One bounded Codex analytics step. Unlike Claude's append-tail scan, a changed rollout is always parsed
 * whole because its token counters are cumulative and a mid-file resume would need carried parser state.
 * The mtime high-water mark still makes steady state cheap: only changed (normally active) rollouts are
 * re-read. Files are admitted whole against the line budget; an oversized file is processed alone, so a
 * single active rollout may exceed the nominal budget but never shares that step with another parsed file.
 */
export function scanCodexStep(
  db: SqliteDb,
  codexDir: string,
  maxLines: number = DEFAULT_MAX_LINES,
  targets: ScanTarget[] = collectCodexScanTargets(codexDir),
): ScanProgress & { wrote: boolean } {
  const stored = readProcessedFiles(db);
  const pending = targets
    .filter((target) => stored.get(target.path)?.mtime !== target.mtimeMs)
    .sort((a, b) => a.path.localeCompare(b.path));
  let filesDone = targets.length - pending.length;
  let wrote = false;
  let remaining = maxLines;
  let parsedFiles = 0;

  for (const target of pending) {
    let content: string;
    try {
      content = readFileSync(target.path, "utf8");
    } catch {
      upsertProcessedFile(
        db,
        target.path,
        target.mtimeMs,
        stored.get(target.path)?.lines ?? 0,
      );
      filesDone++;
      continue;
    }

    // Only newline-terminated records are stable enough to ingest; a half-written tail lands next mtime.
    const segments = content.split("\n");
    const completeLines = segments.length - 1;
    if (parsedFiles > 0 && completeLines > remaining) break;
    const jsonl = segments.slice(0, completeLines).join("\n");
    const cwd = readRolloutHead(target.path)?.cwd ?? "";
    const turns = extractCodexTurns(
      jsonl,
      target.sessionId,
      target.keyPrefix,
      cwd,
    );
    if (turns.length > 0) wrote = true;
    transaction(db, () => {
      upsertTurns(db, turns);
      upsertProcessedFile(db, target.path, target.mtimeMs, completeLines);
    });
    filesDone++;
    parsedFiles++;
    remaining -= completeLines;
    if (remaining <= 0) break;
  }

  return {
    filesTotal: targets.length,
    filesDone,
    done: filesDone === targets.length,
    wrote,
  };
}
