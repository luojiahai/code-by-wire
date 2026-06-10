import type { ContextBreakdown } from '@shared/transcript'

// Row-level helpers shared by the two Claude transcript parsers (transcript.ts and transcript-events.ts).
// Both walk the same JSONL; keeping these in one place stops the number coercion, text extraction, and
// context-size definition from drifting between the summary projection and the render projection.

/** A finite number or 0 — usage fields can be absent or malformed in a half-written transcript line. */
export function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** A user turn's text whether stored as a plain string or content blocks (text blocks only). */
export function userText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b?.type === 'text' && typeof b?.text === 'string')
      .map((b) => b.text)
      .join('\n')
  }
  return ''
}

/** The cache-state split of an assistant message's usage — the fresh input, the part read from cache,
 *  and the part newly cached — or null for a zero-sum block (a '<synthetic>' placeholder carries no real
 *  context). The single definition of "current context size" both transcript parsers derive from. */
export function usageBreakdown(usage: unknown): ContextBreakdown | null {
  if (!usage || typeof usage !== 'object') return null
  const u = usage as Record<string, unknown>
  const input = num(u.input_tokens)
  const cacheRead = num(u.cache_read_input_tokens)
  const cacheCreation = num(u.cache_creation_input_tokens)
  return input + cacheRead + cacheCreation > 0 ? { input, cacheRead, cacheCreation } : null
}
