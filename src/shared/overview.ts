import type { Session } from './types'

/**
 * Order Sessions for the Overview. Waiting is the state that needs action, so those rows
 * pin to the top; every other row keeps its incoming order. Stable, so it layers cleanly
 * on top of whatever sort the Overview applies later (issue #10's sortable table).
 */
export function pinWaiting(sessions: Session[]): Session[] {
  return [...sessions].sort(
    (a, b) => Number(b.state === 'waiting') - Number(a.state === 'waiting'),
  )
}
