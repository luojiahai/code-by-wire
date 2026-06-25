import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelUsage } from "@shared/types";
import type { AnalyticsTurn } from "../../db/analytics";
import { extractTurns, foldTurnsByModel } from "./turns";
import { subagentsDirFor } from "./subagents";

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
  const dir = subagentsDirFor(transcriptPath);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return foldTurnsByModel(turns); // no subagents dir → main-only breakdown
  }
  for (const name of names) {
    if (!name.startsWith("agent-") || !name.endsWith(".jsonl")) continue;
    let jsonl: string;
    try {
      jsonl = readFileSync(join(dir, name), "utf8");
    } catch {
      continue; // an unreadable subagent file is skipped, not fatal
    }
    // keyPrefix mirrors the analytics scan (scan.ts collectScanTargets) so an id-less subagent turn's
    // surrogate key matches across the two paths — the reconciliation guarantee holds even for id-less turns.
    turns.push(...extractTurns(jsonl, sessionId, `${sessionId}/${name}`));
  }
  return foldTurnsByModel(turns);
}
