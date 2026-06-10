import type { Usage } from './types'

export const MODEL_IDS = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'] as const

export type ModelId = (typeof MODEL_IDS)[number]

/** USD per million tokens, by token kind. cacheWrite is the 5-minute cache-creation rate. */
export interface ModelPricing {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

interface ModelSpec {
  id: ModelId
  /** Substring that identifies this family in a raw transcript model string. */
  family: string
  /** Context window the session runs under — the standard 200K fallback for every family (see the table note). */
  contextWindow: number
  pricing: ModelPricing
}

const STANDARD_WINDOW = 200_000

// One row per model: family detection, canonical id, window, and API pricing in a single place, so
// "add a model" is a one-line change. The context window is the standard 200K for every family, the
// real Claude default. A session can run a larger window via the `[1m]` launch tag, but the bare model
// string records no window signal, so the larger window is not derivable here; a live statusLine
// capture overlays the true context_window_size when present (see overlaySessions). This fallback is
// only the approximate window for an uncaptured session (Ended, pre-install, or other-machine).
const MODELS: readonly ModelSpec[] = [
  { id: 'claude-opus-4-8',   family: 'opus',   contextWindow: STANDARD_WINDOW, pricing: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } },
  { id: 'claude-sonnet-4-6', family: 'sonnet', contextWindow: STANDARD_WINDOW, pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  { id: 'claude-haiku-4-5',  family: 'haiku',  contextWindow: STANDARD_WINDOW, pricing: { input: 1, output: 5,  cacheRead: 0.1, cacheWrite: 1.25 } },
]

/** Fallback for a raw string matching no known family. Opus is safe: priciest, so it never understates
 *  the Equivalent API value, and it preserves the prior default. Adding the new model to MODELS above
 *  is the real fix when one ships. */
const DEFAULT_SPEC = MODELS[0]

/** The spec for a canonical model id; DEFAULT_SPEC if somehow unmatched. */
function specById(model: ModelId): ModelSpec {
  return MODELS.find((m) => m.id === model) ?? DEFAULT_SPEC
}

/** The spec for a raw transcript model string, matched by family substring; null when no family matches. */
function specForRaw(raw: string | undefined): ModelSpec | null {
  if (raw) {
    for (const spec of MODELS) {
      if (raw.includes(spec.family)) return spec
    }
  }
  return null
}

/** Map a raw model string (possibly suffixed, e.g. a date stamp or `[1m]`) to a canonical ModelId. An
 *  unrecognized string falls to DEFAULT_SPEC, the safe Opus default for pricing and window. */
export function normalizeModelId(raw: string | undefined): ModelId {
  return (specForRaw(raw) ?? DEFAULT_SPEC).id
}

/** Whether a raw model string matches a known family. False for a model absent from the table, which the
 *  honest label renders by its statusLine display_name rather than masquerading as the Opus fallback. */
export function isKnownModelString(raw: string | undefined): boolean {
  return specForRaw(raw) !== null
}

/**
 * Context window (tokens) for a canonical model: the standard 200K for every family, the real default.
 * The `[1m]` launch tag runs a larger window, but it isn't derivable from the bare model string, so it's
 * never inferred here; a live statusLine capture overlays the true size when present. This is only the
 * fallback window for an uncaptured session.
 */
export function contextWindowFor(model: ModelId): number {
  return specById(model).contextWindow
}

/** Per-million-token API rates for a canonical model. */
export function priceFor(model: ModelId): ModelPricing {
  return specById(model).pricing
}

/** The model's short family name ('opus' | 'sonnet' | 'haiku'), which doubles as the stable
 *  `claude --model` alias. One source of truth so the spawn flag can't drift from the MODELS table. */
export function familyFor(model: ModelId): string {
  return specById(model).family
}

/**
 * Equivalent API value (USD) for a session's summed token usage at the model's API rates. On a
 * subscription account this is a reference figure, not money owed (see CONTEXT.md). Rates are per
 * million tokens, so divide the weighted sum by 1e6.
 */
export function equivApiValue(usage: Usage, model: ModelId): number {
  const p = priceFor(model)
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheCreationTokens * p.cacheWrite) /
    1_000_000
  )
}

/** A session's Equivalent API value, split by token kind, plus the cache-hit saving. All USD. */
export interface CostBreakdown {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /** Sum of the four — equals equivApiValue(usage, model). */
  total: number
  /** USD the cache reads avoided: what they'd have cost as fresh input minus what they cost at the
   *  cache-read rate. The headline benefit of prompt caching, always ≥ 0. Reported separately because
   *  it isn't part of the bill — it's the counterfactual the cache avoided. Not netted against the
   *  cache-write premium; this is the read discount alone, as Claude Code frames "cache savings". */
  cacheSavings: number
}

/**
 * Split a session's summed token usage into per-kind USD at the model's API rates, plus cache-hit
 * savings. The four parts sum to equivApiValue(usage, model) (same rates, same /1e6). On a subscription
 * this is all Equivalent API value, not money owed (see CONTEXT.md); on an API account it's real spend.
 */
export function costBreakdown(usage: Usage, model: ModelId): CostBreakdown {
  const p = priceFor(model)
  const input = (usage.inputTokens * p.input) / 1_000_000
  const output = (usage.outputTokens * p.output) / 1_000_000
  const cacheRead = (usage.cacheReadTokens * p.cacheRead) / 1_000_000
  const cacheWrite = (usage.cacheCreationTokens * p.cacheWrite) / 1_000_000
  const cacheSavings = (usage.cacheReadTokens * (p.input - p.cacheRead)) / 1_000_000
  return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite, cacheSavings }
}
