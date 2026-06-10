import type { ContextBreakdown } from './transcript'

/** Claude Code compacts a session's context automatically as it nears the top of the window. The exact
 *  trigger is in neither the transcript nor the statusLine, so we approximate it at 92% — the single
 *  place to tune the "auto-compact in N tokens" readout. */
export const AUTO_COMPACT_FRACTION = 0.92

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

/** Tokens of headroom before auto-compact: window·fraction − current total, floored at 0. A 0 means the
 *  next turn may trigger a compact. An unknown window (≤0) yields 0. */
export function tokensUntilAutoCompact(total: number, windowTokens: number): number {
  if (windowTokens <= 0) return 0
  return Math.max(0, Math.round(windowTokens * AUTO_COMPACT_FRACTION - total))
}
