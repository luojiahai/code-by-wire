import { readFileSync } from "node:fs";
import type { ModelUsage } from "@shared/types";
import type { AnalyticsTurn } from "../../db/analytics";
import { extractTurns, foldTurnsByModel, dedupeTurnsById } from "./turns";
import {
  collectReferencedAgentIds,
  listSessionSubagentFiles,
} from "./subagents";

/**
 * A session's per-model token breakdown: its main transcript folded with every subagent transcript, each
 * turn extracted by the SAME extractTurns/cacheCreationSplit the analytics scan uses, then folded by raw
 * model id. Running the scan's extraction over the session's own files is what makes this reconcile with
 * the overview by construction (issue #240). `mainJsonl` is the already-read parent transcript (summarize
 * reads it once and passes it here, so the file isn't read twice); `transcriptPath` locates the sibling
 * subagents dir. A missing dir or an unreadable subagent file is skipped, never fatal — the breakdown
 * reflects whatever transcripts exist on disk, same retention behavior as the rest of the panel.
 */
export function usageByModelFor(
  mainJsonl: string,
  transcriptPath: string,
  sessionId: string,
): ModelUsage[] {
  const turns: AnalyticsTurn[] = extractTurns(mainJsonl, sessionId);
  // Both layouts, flat gated on this transcript's own agentId references (A3) — the main JSONL is
  // already in hand, so the reference walk costs no extra read.
  for (const { path, keyPrefix } of listSessionSubagentFiles(
    transcriptPath,
    sessionId,
    () => collectReferencedAgentIds(mainJsonl),
  )) {
    let jsonl: string;
    try {
      jsonl = readFileSync(path, "utf8");
    } catch {
      continue; // an unreadable subagent file is skipped, not fatal
    }
    turns.push(...extractTurns(jsonl, sessionId, keyPrefix));
  }
  return foldTurnsByModel(dedupeTurnsById(turns));
}
