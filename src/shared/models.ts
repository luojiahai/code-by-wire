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
  /** Window Claude Code runs a standard session under; the "[1m]" beta overrides it (contextWindowFor). */
  contextWindow: number
  pricing: ModelPricing
}

/** What Claude Code caps a session at unless the "[1m]" beta is active. */
const STANDARD_WINDOW = 200_000
const ONE_MILLION_WINDOW = 1_000_000

// One row per model: family detection, canonical id, window, and API pricing in a single place, so
// "add a model" is a one-line change and nothing silently misclassifies a new model as opus. Cache
// rates follow the published multipliers (read = 0.1x input, 5-minute write = 1.25x input).
const MODELS: readonly ModelSpec[] = [
  { id: 'claude-opus-4-8',   family: 'opus',   contextWindow: STANDARD_WINDOW, pricing: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } },
  { id: 'claude-sonnet-4-6', family: 'sonnet', contextWindow: STANDARD_WINDOW, pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  { id: 'claude-haiku-4-5',  family: 'haiku',  contextWindow: STANDARD_WINDOW, pricing: { input: 1, output: 5,  cacheRead: 0.1, cacheWrite: 1.25 } },
]

/** Fallback for a raw string matching no known family. Opus is safe: it's the priciest, so it never
 *  understates the Equivalent API value, and it preserves the prior default. Adding the new model to
 *  MODELS above is the real fix when a model ships. */
const DEFAULT_SPEC = MODELS[0]

/** The spec for a raw transcript model string, matched by family substring; DEFAULT_SPEC if unknown. */
function specFor(raw: string | undefined): ModelSpec {
  if (raw) {
    for (const spec of MODELS) {
      if (raw.includes(spec.family)) return spec
    }
  }
  return DEFAULT_SPEC
}

/** Map a raw transcript model string (possibly suffixed, e.g. "[1m]") to a canonical ModelId. */
export function normalizeModelId(raw: string | undefined): ModelId {
  return specFor(raw).id
}

/**
 * Context window (tokens) for a RAW transcript model string. The "[1m]" suffix means the session
 * opted into the 1M-token beta, which Claude Code otherwise caps at the standard window — so the
 * window depends on a bit that normalizeModelId strips. Always pass the raw string, never a ModelId.
 */
export function contextWindowFor(rawModel: string | undefined): number {
  if (rawModel?.includes('[1m]')) return ONE_MILLION_WINDOW
  return specFor(rawModel).contextWindow
}

/** Per-million-token API rates for a canonical model. */
export function priceFor(model: ModelId): ModelPricing {
  return (MODELS.find((m) => m.id === model) ?? DEFAULT_SPEC).pricing
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
