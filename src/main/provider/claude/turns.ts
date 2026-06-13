import type { AnalyticsTurn } from "../../db/analytics";
import { projectFromCwd } from "../../project-name";
import { num, parseJsonlRowsAt } from "./transcript-row";

/** Claude injects '<synthetic>' assistant turns (cancelled / over-limit placeholders) that carry zero
 *  usage. Skipping the whole row here is a deliberate simplification: parseTranscript instead suppresses
 *  only the model label and lets the zero usage sum in, but the result is identical and an explicit skip
 *  keeps a synthetic row from ever minting a turn. */
const SYNTHETIC_MODEL = "<synthetic>";

/**
 * Project a Transcript's JSONL into one turn record per assistant turn. Mirrors parseTranscript's per-turn
 * dedup (a turn repeats across content-block lines under one message id; first sight wins) and counts
 * Subagent (isSidechain) turns — their usage is real, billed cost — but skips synthetic placeholders.
 *
 * An assistant turn with no message id (rare) gets a position-stable surrogate (`<keyPrefix>#<lineNo>`)
 * keyed on its ABSOLUTE raw line number, so the same physical line keys identically whether the file is
 * parsed whole or only from an appended `startLine` — that is what makes an incremental re-scan upsert in
 * place rather than double-count. `keyPrefix` defaults to `sessionId`; a subagent transcript passes its
 * own prefix so an id-less subagent turn can't collide with an id-less parent turn that shares the
 * session. `cwd` is recorded in full; `project` is its basename for display.
 */
export function extractTurns(
  jsonl: string,
  sessionId: string,
  keyPrefix: string = sessionId,
  startLine = 0,
): AnalyticsTurn[] {
  const out: AnalyticsTurn[] = [];
  const counted = new Set<string>();
  parseJsonlRowsAt(jsonl, startLine).forEach(({ row, line }) => {
    if (row?.type !== "assistant") return;
    const model = row.message?.model;
    if (model === SYNTHETIC_MODEL) return;
    const usage = row.message?.usage;
    if (!usage || typeof usage !== "object") return;

    const id =
      typeof row.message?.id === "string"
        ? row.message.id
        : `${keyPrefix}#${line}`;
    if (counted.has(id)) return;
    counted.add(id);

    const cwd = typeof row.cwd === "string" ? row.cwd : "";
    const tsMs =
      typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    out.push({
      messageId: id,
      sessionId,
      // 0 is the unknown-time sentinel: a missing/unparseable timestamp. readTotals' windowed ranges
      // exclude ts=0 (no positive bound matches it) but all-time keeps it — see the note there.
      ts: Number.isNaN(tsMs) ? 0 : tsMs,
      modelRaw: typeof model === "string" ? model : undefined,
      usage: {
        inputTokens: num(usage.input_tokens),
        outputTokens: num(usage.output_tokens),
        cacheReadTokens: num(usage.cache_read_input_tokens),
        cacheCreationTokens: num(usage.cache_creation_input_tokens),
      },
      cwd,
      project: projectFromCwd(cwd),
      branch: typeof row.gitBranch === "string" ? row.gitBranch : undefined,
    });
  });
  return out;
}
