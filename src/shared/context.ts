import type { ContextBreakdown } from './transcript'

/** One labeled slice of the current context for the breakdown panel. `pct` is share of the context in
 *  use (0–100), not of the whole window. */
export interface ContextSegment {
  key: 'cacheRead' | 'cacheCreation' | 'input'
  label: string
  tokens: number
  pct: number
}

/** Total tokens in the current context — the latest turn's full prompt. */
export function contextTotal(b: ContextBreakdown): number {
  return b.cacheRead + b.cacheCreation + b.input
}

/** The current context split by cache state, largest-first (the stable cached bulk on top), each with
 *  its share of the in-use total. An all-zero context yields zero-pct segments, never NaN. */
export function contextSegments(b: ContextBreakdown): ContextSegment[] {
  const total = contextTotal(b)
  const share = (n: number): number => (total > 0 ? Math.round((n / total) * 100) : 0)
  return [
    { key: 'cacheRead', label: 'Cached · stable', tokens: b.cacheRead, pct: share(b.cacheRead) },
    { key: 'cacheCreation', label: 'New this turn', tokens: b.cacheCreation, pct: share(b.cacheCreation) },
    { key: 'input', label: 'Fresh input', tokens: b.input, pct: share(b.input) },
  ]
}

/** The context panel's resolved view: the split to show, its token total, and the fill %. */
export interface ContextView {
  segments: ContextSegment[]
  total: number
  /** Fill %, 0 to 100. The capture's used_percentage when live, else tokens-over-window. */
  pct: number
}

/**
 * Resolve the context panel's view. Prefer the live statusLine capture: the current_usage split, and
 * the fill % straight from Claude's used_percentage (so it matches the Overview's % for the Session).
 * With no live split, fall back to the transcript-derived split and a tokens-over-window %. Returns null
 * only when neither source has any context, which is the panel's empty state.
 */
export function contextView(opts: {
  live: ContextBreakdown | null | undefined
  fallback: ContextBreakdown | null | undefined
  capturedPct: number | null | undefined
  window: number
}): ContextView | null {
  const pctOfWindow = (total: number): number =>
    opts.window > 0 ? Math.min(100, Math.round((total / opts.window) * 100)) : 0
  if (opts.live) {
    const total = contextTotal(opts.live)
    const pct = opts.capturedPct != null ? Math.min(100, Math.max(0, Math.round(opts.capturedPct))) : pctOfWindow(total)
    return { segments: contextSegments(opts.live), total, pct }
  }
  if (opts.fallback) {
    const total = contextTotal(opts.fallback)
    return { segments: contextSegments(opts.fallback), total, pct: pctOfWindow(total) }
  }
  return null
}
