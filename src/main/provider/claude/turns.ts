import type { AnalyticsTurn } from "../../db/analytics";
import { projectFromCwd } from "../../project-name";
import { parseJsonlRowsAt } from "./transcript-row";
import { UsageAccumulator } from "./usage-accumulator";
import type { ModelUsage } from "@shared/types";
import { emptyUsage, tokenTotal } from "@shared/usage-by-model";

/** Claude injects '<synthetic>' assistant turns (cancelled / over-limit placeholders) that carry zero
 *  usage. Skipping the whole row here is a deliberate simplification: parseTranscript instead suppresses
 *  only the model label and lets the zero usage sum in, but the result is identical and an explicit skip
 *  keeps a synthetic row from ever minting a turn. */
const SYNTHETIC_MODEL = "<synthetic>";

/**
 * Project a Transcript's JSONL into one turn record per assistant turn. Mirrors parseTranscript's per-turn
 * dedup (a turn repeats across content-block lines under one message id; the LAST row's usage wins —
 * see UsageAccumulator — while ts/model/cwd stay first-seen) and counts Subagent (isSidechain) turns —
 * their usage is real, billed cost — but skips synthetic placeholders.
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
  const acc = new UsageAccumulator<Omit<AnalyticsTurn, "usage">>();
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
    acc.add(id, usage, () => {
      const cwd = typeof row.cwd === "string" ? row.cwd : "";
      const tsMs =
        typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
      return {
        messageId: id,
        sessionId,
        agent: "claude",
        // 0 is the unknown-time sentinel: a missing/unparseable timestamp. readTotals' windowed ranges
        // exclude ts=0 (no positive bound matches it) but all-time keeps it — see the note there.
        ts: Number.isNaN(tsMs) ? 0 : tsMs,
        modelRaw: typeof model === "string" ? model : undefined,
        cwd,
        project: projectFromCwd(cwd),
        branch: typeof row.gitBranch === "string" ? row.gitBranch : undefined,
      };
    });
  });
  return acc.entries().map(({ usage, value }) => ({ ...value, usage }));
}

/** Collapse duplicate message ids ACROSS a session's files (main + each subagent transcript): the
 *  first-seen turn keeps its metadata, the last usage wins — the same rule extractTurns applies within
 *  one file. Guards usageByModelFor against a message mirrored in two files; the analytics scan gets
 *  the equivalent protection from the turns table's message_id primary key. */
export function dedupeTurnsById(turns: AnalyticsTurn[]): AnalyticsTurn[] {
  const byId = new Map<string, AnalyticsTurn>();
  for (const t of turns) {
    const prev = byId.get(t.messageId);
    byId.set(t.messageId, prev ? { ...prev, usage: t.usage } : t);
  }
  return [...byId.values()];
}

/** Fold a session's assistant turns into one ModelUsage per model, summing usage field by field and keying
 *  on the raw model id (an id-less turn folds under null, matching the overview's null "Unknown" bucket).
 *  This is the same per-(session × model) shape the analytics scan stores via groupBySession — and sharing
 *  extractTurns with the scan is exactly what makes the panel reconcile with the overview (issue #240).
 *  Entries order by total tokens descending, then raw id, so the stored breakdown and the panel's
 *  attribution line are stable across re-summarize. */
export function foldTurnsByModel(turns: AnalyticsTurn[]): ModelUsage[] {
  const map = new Map<string | null, ModelUsage>();
  for (const t of turns) {
    const key = t.modelRaw ?? null;
    let mu = map.get(key);
    if (!mu) {
      mu = { modelRaw: key, usage: emptyUsage() };
      map.set(key, mu);
    }
    mu.usage.inputTokens += t.usage.inputTokens;
    mu.usage.outputTokens += t.usage.outputTokens;
    mu.usage.cacheReadTokens += t.usage.cacheReadTokens;
    mu.usage.cacheCreationTokens += t.usage.cacheCreationTokens;
    mu.usage.cacheCreation5mTokens += t.usage.cacheCreation5mTokens;
    mu.usage.cacheCreation1hTokens += t.usage.cacheCreation1hTokens;
  }
  return [...map.values()].sort(
    (a, b) =>
      tokenTotal(b.usage) - tokenTotal(a.usage) ||
      (a.modelRaw ?? "").localeCompare(b.modelRaw ?? ""),
  );
}
