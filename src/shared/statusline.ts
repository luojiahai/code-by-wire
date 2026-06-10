import type { Account, RateLimit, Session } from './types'

/** One normalized statusLine capture for a Session, parsed from a side-channel file. Plain data so it
 *  crosses IPC cleanly. `null` fields are "the statusLine didn't report this", distinct from 0. */
export interface StatusLineSample {
  sessionId: string
  /** File mtime (ms) of the capture — its freshness, used to pick the account snapshot. */
  capturedMtimeMs: number
  costUsd: number | null
  linesAdded: number | null
  linesRemoved: number | null
  /** Live context fill 0–100 (statusLine used_percentage), or null when the statusLine omitted it. */
  contextPct: number | null
  /** Live context window size (tokens), or null when omitted. */
  contextWindow: number | null
  /** Account rate limits — present only for a subscription; null for an API account. Each window may
   *  be independently absent (the statusLine populates them after the first API response). */
  rateLimits: { fiveHour?: RateLimit; sevenDay?: RateLimit } | null
}

/** The seam ipc.ts depends on: the live captures the wrapper writes. Implemented in main by a file reader. */
export interface StatusLineReader {
  /** All current captures, one (freshest) per file. */
  read(): StatusLineSample[]
}

/** A capture older than this can't describe a current 5-hour or 7-day window, and its session is long
 *  gone from the index — so it's both ignored when deriving the account and pruned from disk on read. */
export const CAPTURE_STALE_MS = 7 * 24 * 60 * 60 * 1000

/** Freshest sample per Session id — a session that wrote several captures keeps only its newest. */
export function freshestBySession(samples: StatusLineSample[]): Map<string, StatusLineSample> {
  const byId = new Map<string, StatusLineSample>()
  for (const s of samples) {
    const prev = byId.get(s.sessionId)
    if (!prev || s.capturedMtimeMs > prev.capturedMtimeMs) byId.set(s.sessionId, s)
  }
  return byId
}

/** A rate-limit window only if its reset is still ahead. A window that has already reset can't be
 *  described by a past capture, so it's dropped rather than shown with a stale "% used · resets now". */
function liveWindow(w: RateLimit | undefined, now: number): RateLimit | undefined {
  return w && w.resetsAt > now ? w : undefined
}

/**
 * The app-wide Account from the live statusLine captures within `staleMs` of `now`. Billing mode is
 * detected from rate-limit presence (ADR-0001): a capture carrying rate_limits is a subscription, one
 * without is an API account. To avoid flapping — a subscription session that hasn't had its first API
 * response yet (or an API-key session running alongside) carries no rate_limits — the account takes its
 * windows from the freshest capture that HAS them, and only reports 'api' when no fresh capture carries
 * any. Returns null when there's no recent statusLine data at all (the UI reads null as "no bars"). Each
 * window is dropped once its reset has passed, so a stale capture can't show an expired limit as current.
 */
export function deriveAccount(samples: Iterable<StatusLineSample>, now: number, staleMs: number): Account | null {
  let freshest: StatusLineSample | null = null
  let withLimits: StatusLineSample | null = null
  for (const s of samples) {
    if (now - s.capturedMtimeMs > staleMs) continue
    if (!freshest || s.capturedMtimeMs > freshest.capturedMtimeMs) freshest = s
    if (s.rateLimits && (!withLimits || s.capturedMtimeMs > withLimits.capturedMtimeMs)) withLimits = s
  }
  if (withLimits?.rateLimits) {
    return {
      billingMode: 'subscription',
      fiveHour: liveWindow(withLimits.rateLimits.fiveHour, now),
      sevenDay: liveWindow(withLimits.rateLimits.sevenDay, now),
    }
  }
  if (freshest) return { billingMode: 'api' }
  return null
}

/**
 * Overlay live statusLine numbers onto each Session that has a sample. Cost, lines, and context come
 * from the statusLine when present; a Session with no sample passes through untouched, still showing
 * its transcript-computed context % and Equivalent API value (graceful degradation, ADR-0001). A sample
 * that omitted a field falls back to the Session's computed value for that field.
 */
export function overlaySessions(sessions: Session[], byId: Map<string, StatusLineSample>): Session[] {
  return sessions.map((s) => {
    const sample = byId.get(s.id)
    if (!sample) return s
    return {
      ...s,
      contextPct: sample.contextPct ?? s.contextPct,
      contextWindow: sample.contextWindow ?? s.contextWindow,
      liveCostUsd: sample.costUsd ?? undefined,
      linesAdded: sample.linesAdded ?? undefined,
      linesRemoved: sample.linesRemoved ?? undefined,
    }
  })
}
