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
  /** Context window the session runs under — a fixed per-family choice (see the table note). */
  contextWindow: number
  pricing: ModelPricing
}

const STANDARD_WINDOW = 200_000
const ONE_MILLION_WINDOW = 1_000_000

// One row per model: family detection, canonical id, window, and API pricing in a single place, so
// "add a model" is a one-line change. The context window is FIXED per family, not read from the
// transcript: Claude Code records no window or beta signal (the model string is bare even on the 1M
// beta), so we map Opus -> 1M and everything else -> the standard 200K, matching what Claude Code
// surfaces by default. Sonnet also has a 1M beta; treating it as 200K here is a deliberate choice.
const MODELS: readonly ModelSpec[] = [
  { id: 'claude-opus-4-8',   family: 'opus',   contextWindow: ONE_MILLION_WINDOW, pricing: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } },
  { id: 'claude-sonnet-4-6', family: 'sonnet', contextWindow: STANDARD_WINDOW,    pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  { id: 'claude-haiku-4-5',  family: 'haiku',  contextWindow: STANDARD_WINDOW,    pricing: { input: 1, output: 5,  cacheRead: 0.1, cacheWrite: 1.25 } },
]

/** Fallback for a raw string matching no known family. Opus is safe: priciest (never understates the
 *  Equivalent API value) and largest window, and it preserves the prior default. Adding the new model
 *  to MODELS above is the real fix when one ships. */
const DEFAULT_SPEC = MODELS[0]

/** The spec for a canonical model id; DEFAULT_SPEC if somehow unmatched. */
function specById(model: ModelId): ModelSpec {
  return MODELS.find((m) => m.id === model) ?? DEFAULT_SPEC
}

/** The spec for a raw transcript model string, matched by family substring; DEFAULT_SPEC if unknown. */
function specForRaw(raw: string | undefined): ModelSpec {
  if (raw) {
    for (const spec of MODELS) {
      if (raw.includes(spec.family)) return spec
    }
  }
  return DEFAULT_SPEC
}

/** Map a raw transcript model string (possibly suffixed, e.g. a date stamp) to a canonical ModelId. */
export function normalizeModelId(raw: string | undefined): ModelId {
  return specForRaw(raw).id
}

/**
 * Context window (tokens) for a canonical model. Fixed per family — Opus runs the 1M window, others
 * the standard 200K. The window is NOT derivable from the transcript (Claude Code records no window
 * or beta signal), so it's a deterministic property of the model here, never parsed or persisted.
 */
export function contextWindowFor(model: ModelId): number {
  return specById(model).contextWindow
}

/** Per-million-token API rates for a canonical model. */
export function priceFor(model: ModelId): ModelPricing {
  return specById(model).pricing
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
