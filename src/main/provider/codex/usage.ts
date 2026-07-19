import type { ContextBreakdown } from "@shared/transcript";
import type { ModelUsage, Usage } from "@shared/types";
import { asRecord } from "./rollout";

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** One token_count event's normalized deltas (input excludes cached), for the throughput panel. */
export interface CodexTokenEvent {
  tsMs: number;
  input: number;
  output: number;
}

/** Everything the sidebar needs from one rollout, computed in a single pass (see scanRolloutTelemetry). */
export interface RolloutTelemetry {
  /** Cumulative session usage, normalized to the shared (disjoint) Usage shape. */
  usage: Usage;
  /** Per-model attribution via total_token_usage deltas paired with the active turn_context model. */
  usageByModel: ModelUsage[];
  /** last_token_usage.total_tokens of the newest token_count — current context occupancy. */
  contextTokens: number;
  /** The newest token_count's last_token_usage as a breakdown — the Pressure panel's live split. */
  liveContext: ContextBreakdown | null;
  modelContextWindow: number | null;
  /** Last turn_context model, the honest raw label. */
  modelRaw: string | null;
  effortLevel: string | null;
  compactionCount: number;
  tokenEvents: CodexTokenEvent[];
}

/** Codex counts cached as a SUBSET of input_tokens; our Usage shape keeps them disjoint. The two
 *  cached spellings cover current (cached_input_tokens) and legacy (cache_read_input_tokens) rollouts;
 *  cache_write_input_tokens exists only on codex ≥0.145 and defaults 0. */
interface RawTotals {
  input: number; // non-cached
  cacheRead: number;
  cacheWrite: number;
  output: number;
  total: number; // codex's own total_tokens — the context-occupancy basis
}

const ZERO_TOTALS: RawTotals = {
  input: 0,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
  total: 0,
};

function readTokenUsage(raw: Record<string, unknown>): RawTotals {
  const cached =
    num(raw.cached_input_tokens) || num(raw.cache_read_input_tokens);
  return {
    input: Math.max(0, num(raw.input_tokens) - cached),
    cacheRead: cached,
    cacheWrite: num(raw.cache_write_input_tokens),
    output: num(raw.output_tokens),
    total: num(raw.total_tokens),
  };
}

/** The shared breakdown rule — transcript-events.ts uses this too, so the transcript's context split
 *  and the sidebar's liveContext can never disagree. */
export function breakdownFromTokenUsage(
  raw: Record<string, unknown>,
): ContextBreakdown {
  const t = readTokenUsage(raw);
  return {
    input: t.input,
    cacheRead: t.cacheRead,
    cacheCreation: t.cacheWrite,
  };
}

function toUsage(t: RawTotals): Usage {
  return {
    inputTokens: t.input,
    outputTokens: t.output,
    cacheReadTokens: t.cacheRead,
    cacheCreationTokens: t.cacheWrite,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  };
}

/** Element-wise cumulative delta, clamped ≥0 per field: a cumulative reset (fork/rollover) yields a
 *  zero delta rather than corrupting a bucket, and the final `usage` stays the last reported total. */
function deltaTotals(prev: RawTotals, next: RawTotals): RawTotals {
  const d = (a: number, b: number): number => Math.max(0, b - a);
  return {
    input: d(prev.input, next.input),
    cacheRead: d(prev.cacheRead, next.cacheRead),
    cacheWrite: d(prev.cacheWrite, next.cacheWrite),
    output: d(prev.output, next.output),
    total: d(prev.total, next.total),
  };
}

function addTotals(a: RawTotals, b: RawTotals): RawTotals {
  return {
    input: a.input + b.input,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    output: a.output + b.output,
    total: a.total + b.total,
  };
}

/**
 * Single-pass telemetry scan of a rollout's JSONL — the sidebar analog of parseRolloutEvents,
 * reading only the telemetry lines: token_count (usage, context, window), turn_context (model,
 * effort), compacted (count). Tolerant like every rollout parser here: no line may throw, a
 * half-written trailing line is fine, and a token_count with info:null (a rate-limit-only update)
 * is skipped for usage.
 */
export function scanRolloutTelemetry(jsonl: string): RolloutTelemetry {
  let prev = ZERO_TOTALS;
  let liveContext: ContextBreakdown | null = null;
  let contextTokens = 0;
  let modelContextWindow: number | null = null;
  let modelRaw: string | null = null;
  let effortLevel: string | null = null;
  let compactionCount = 0;
  const tokenEvents: CodexTokenEvent[] = [];
  // Insertion-ordered per-model buckets; null key = "no model reported yet".
  const buckets = new Map<string | null, RawTotals>();

  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, unknown> | null;
    try {
      row = asRecord(JSON.parse(line));
    } catch {
      continue;
    }
    if (!row) continue;
    if (row.type === "compacted") {
      compactionCount++;
      continue;
    }
    const payload = asRecord(row.payload);
    if (!payload) continue;

    if (row.type === "turn_context") {
      if (typeof payload.model === "string" && payload.model)
        modelRaw = payload.model;
      const effort = payload.effort ?? payload.reasoning_effort;
      if (typeof effort === "string" && effort) effortLevel = effort;
      continue;
    }

    if (row.type !== "event_msg" || payload.type !== "token_count") continue;
    const info = asRecord(payload.info);
    if (!info) continue; // rate-limit-only update
    const totalRaw = asRecord(info.total_token_usage);
    const lastRaw = asRecord(info.last_token_usage);
    const window = num(info.model_context_window);
    if (window > 0) modelContextWindow = window;
    if (lastRaw) {
      liveContext = breakdownFromTokenUsage(lastRaw);
      contextTokens = readTokenUsage(lastRaw).total;
    }
    if (!totalRaw) continue;
    const totals = readTokenUsage(totalRaw);
    const delta = deltaTotals(prev, totals);
    prev = totals;
    // The active turn_context model is authoritative; a token event's own info.model fills a gap.
    const eventModel = info.model ?? info.model_name;
    const model =
      modelRaw ??
      (typeof eventModel === "string" && eventModel ? eventModel : null);
    buckets.set(model, addTotals(buckets.get(model) ?? ZERO_TOTALS, delta));
    const ts =
      typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    if (Number.isFinite(ts))
      tokenEvents.push({ tsMs: ts, input: delta.input, output: delta.output });
  }

  return {
    usage: toUsage(prev),
    usageByModel: [...buckets.entries()].map(([m, t]) => ({
      modelRaw: m,
      usage: toUsage(t),
    })),
    contextTokens,
    liveContext,
    modelContextWindow,
    modelRaw,
    effortLevel,
    compactionCount,
    tokenEvents,
  };
}
