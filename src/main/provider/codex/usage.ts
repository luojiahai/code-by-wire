import type { TokenSpeed } from "@shared/metrics";
import type { ContextBreakdown } from "@shared/transcript";
import type { ModelUsage, Usage } from "@shared/types";
import { asRecord } from "./rollout";
import {
  ZERO_TOTALS,
  addTotals,
  deltaTotals,
  readTokenUsage,
  totalsToUsage,
  type RawTotals,
} from "./token-math";

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
    usage: totalsToUsage(prev),
    usageByModel: [...buckets.entries()].map(([m, t]) => ({
      modelRaw: m,
      usage: totalsToUsage(t),
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

/** Codex's own /status reserves this much for prompts, tools, and compact headroom — both sides of
 *  the remaining-percent division subtract it, so our fill matches what codex shows its user. */
export const CODEX_CONTEXT_BASELINE_TOKENS = 12_000;

/** Context fill 0-100 exactly as codex's TUI computes it: 100 − percent_of_context_window_remaining,
 *  over last_token_usage.total_tokens. A window at/below the baseline degenerates to the raw ratio
 *  (never a division by ≤0); an unknown window reads 0 like pctOfWindow does. */
export function codexContextPct(totalTokens: number, window: number): number {
  if (window <= 0) return 0;
  const effective = window - CODEX_CONTEXT_BASELINE_TOKENS;
  if (effective <= 0)
    return Math.min(100, Math.round((totalTokens / window) * 100));
  const used = Math.max(0, totalTokens - CODEX_CONTEXT_BASELINE_TOKENS);
  const remaining = Math.min(
    100,
    Math.max(0, Math.round(((effective - used) / effective) * 100)),
  );
  return 100 - remaining;
}

/**
 * Token throughput over the rolling window, from token_count deltas. Each event's tokens are spread
 * over the interval since the PREVIOUS event (the first event has no interval and never counts);
 * intervals are sequential by construction so the denominator is their clipped sum — the codex
 * analog of transcript-speed.ts's computeTokenSpeed, coarser because codex reports per turn, not
 * per message. Null when fewer than two events land in the window or the duration is zero.
 */
export function speedFromTokenEvents(
  events: CodexTokenEvent[],
  windowMs: number,
): TokenSpeed | null {
  if (events.length < 2) return null;
  const latest = events[events.length - 1].tsMs;
  const windowStart = windowMs > 0 ? latest - windowMs : -Infinity;
  let input = 0;
  let output = 0;
  let durMs = 0;
  for (let i = 1; i < events.length; i++) {
    const ev = events[i];
    if (ev.tsMs < windowStart) continue;
    const start = Math.max(events[i - 1].tsMs, windowStart);
    if (ev.tsMs <= start) continue; // zero-length or out-of-order interval
    durMs += ev.tsMs - start;
    input += ev.input;
    output += ev.output;
  }
  if (durMs <= 0) return null;
  const sec = durMs / 1000;
  return {
    inputTps: input / sec,
    outputTps: output / sec,
    totalTps: (input + output) / sec,
  };
}
