import type { Session, SessionState } from './types'

export type SortKey = 'default' | 'ctx' | 'value' | 'last'
export type Filter = 'all' | SessionState

/** Default-sort precedence: Waiting loudest, then Working, Idle, Ended. */
export const STATE_ORDER: Record<SessionState, number> = { waiting: 0, working: 1, idle: 2, ended: 3 }

/**
 * Order Sessions for the Overview. Waiting is the state that needs action, so those rows
 * pin to the top; every other row keeps its incoming order. Stable, so it layers cleanly
 * on top of whatever sort the Overview applies (issue #10's sortable table).
 */
export function pinWaiting(sessions: Session[]): Session[] {
  return [...sessions].sort(
    (a, b) => Number(b.state === 'waiting') - Number(a.state === 'waiting'),
  )
}

/**
 * Order Sessions for the table by the chosen column, most-recent first within ties. 'default'
 * groups by state (Waiting first) then recency. Returns a new array (never mutates); JS sort is
 * stable, so equal keys keep their incoming order — the table layers pinWaiting on top afterwards.
 */
export function sortSessions(sessions: Session[], sort: SortKey): Session[] {
  return [...sessions].sort((a, b) => {
    if (sort === 'ctx') return b.contextPct - a.contextPct
    if (sort === 'value') return b.equivApiValueUsd - a.equivApiValueUsd
    if (sort === 'last') return b.lastActivityMs - a.lastActivityMs
    return STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.lastActivityMs - a.lastActivityMs
  })
}
