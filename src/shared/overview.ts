import type { Session, SessionState } from './types'

export type SortKey = 'default' | 'ctx' | 'value' | 'last'
export type Filter = 'all' | SessionState

/** Default-sort precedence + display order: Waiting loudest, then Working, Idle, Ended. */
export const STATE_ORDER: Record<SessionState, number> = { waiting: 0, working: 1, idle: 2, ended: 3 }

/** SessionStates in display order, derived from STATE_ORDER — the one source of state ordering the
 *  filter chips and counts read from, so adding a state is a single STATE_ORDER edit. */
export const ORDERED_STATES = (Object.keys(STATE_ORDER) as SessionState[]).sort(
  (a, b) => STATE_ORDER[a] - STATE_ORDER[b],
)

/** Lifts Waiting Sessions above everything else; 0 between rows of equal Waiting-ness. The single
 *  definition of the "Waiting on top" rule, shared by pinWaiting and sortSessions. */
const waitingFirst = (a: Session, b: Session): number =>
  Number(b.state === 'waiting') - Number(a.state === 'waiting')

/**
 * Pin Waiting Sessions to the top, leaving every other row in its incoming order. Stable. Kept as a
 * standalone helper; the table gets the same pinning for free via sortSessions.
 */
export function pinWaiting(sessions: Session[]): Session[] {
  return [...sessions].sort(waitingFirst)
}

/** Per-column comparators, all descending; 'default' groups by state then recency. Keyed by SortKey,
 *  so adding a sort column is a compile error here until its comparator exists. */
const COMPARATORS: Record<SortKey, (a: Session, b: Session) => number> = {
  default: (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.lastActivityMs - a.lastActivityMs,
  ctx: (a, b) => b.contextPct - a.contextPct,
  // The displayed figure is live cost when present, else the computed Equivalent API value — sort on
  // the same number the row shows, so "sort by Value" never disagrees with the eye.
  value: (a, b) => (b.liveCostUsd ?? b.equivApiValueUsd) - (a.liveCostUsd ?? a.equivApiValueUsd),
  last: (a, b) => b.lastActivityMs - a.lastActivityMs,
}

/**
 * Order Sessions for the table by the chosen column, most-recent first within ties, with Waiting
 * always pinned on top so the rows that need action are never buried — in one pass, no second sort.
 * 'default' groups by state (Waiting first) then recency. Returns a new array (never mutates); JS
 * sort is stable, so equal keys keep their incoming order.
 */
export function sortSessions(sessions: Session[], sort: SortKey): Session[] {
  const byColumn = COMPARATORS[sort]
  return [...sessions].sort((a, b) => waitingFirst(a, b) || byColumn(a, b))
}

/** Filter Sessions to a single state, or pass them all through for 'all'. Pure; returns a fresh array. */
export function filterSessions(sessions: Session[], filter: Filter): Session[] {
  return filter === 'all' ? sessions.slice() : sessions.filter((s) => s.state === filter)
}

/** Per-state Session counts plus the 'all' total, for the filter chips. Seeded from ORDERED_STATES
 *  so every state gets a zero entry without re-listing them here. */
export function stateCounts(sessions: Session[]): Record<Filter, number> {
  const byState = {} as Record<SessionState, number>
  for (const state of ORDERED_STATES) byState[state] = 0
  for (const s of sessions) byState[s.state] += 1
  return { all: sessions.length, ...byState }
}
