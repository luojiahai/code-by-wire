import type { Usage } from "@shared/types";

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** Codex cumulative token counters normalized to Code-by-wire's disjoint token kinds. */
export interface RawTotals {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  /** Codex's own total_tokens value, used for context occupancy rather than billing totals. */
  total: number;
}

export const ZERO_TOTALS: RawTotals = {
  input: 0,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
  total: 0,
};

/** Codex reports cached reads as a subset of input_tokens; keep the shared Usage kinds disjoint. */
export function readTokenUsage(raw: Record<string, unknown>): RawTotals {
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

/** Element-wise cumulative delta, clamped at zero across resets/forks. */
export function deltaTotals(prev: RawTotals, next: RawTotals): RawTotals {
  const delta = (a: number, b: number): number => Math.max(0, b - a);
  return {
    input: delta(prev.input, next.input),
    cacheRead: delta(prev.cacheRead, next.cacheRead),
    cacheWrite: delta(prev.cacheWrite, next.cacheWrite),
    output: delta(prev.output, next.output),
    total: delta(prev.total, next.total),
  };
}

export function addTotals(a: RawTotals, b: RawTotals): RawTotals {
  return {
    input: a.input + b.input,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    output: a.output + b.output,
    total: a.total + b.total,
  };
}

export function totalsToUsage(t: RawTotals): Usage {
  return {
    inputTokens: t.input,
    outputTokens: t.output,
    cacheReadTokens: t.cacheRead,
    cacheCreationTokens: t.cacheWrite,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  };
}

export function totalsAreZero(t: RawTotals): boolean {
  return (
    t.input === 0 && t.cacheRead === 0 && t.cacheWrite === 0 && t.output === 0
  );
}
