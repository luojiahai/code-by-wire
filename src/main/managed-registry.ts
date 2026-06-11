import type { ManagedPty } from './provider/claude/rotation'

/**
 * The set of session ids THIS app run spawned and controls — the single authority for whether a
 * discovered session is Managed. The provider consults `has` when labelling; the terminal manager
 * calls `add` on spawn and `remove` when the pty dies (natural exit or window close). In-memory by
 * design: a Managed session lives only as long as its pty, so once that pty is gone the id is dropped
 * and discovery re-derives the session as Observed (Adopt, issue #14, is the path to resume it).
 *
 * Each id is anchored to its pty's `pid`, not just its name: `/clear` rotates the Claude session id
 * under the same process, so `entries`/`rename` let the sync follow a living pty to its new id instead
 * of losing it to Observed.
 */
export interface ManagedRegistry {
  add(id: string, pid: number): void
  remove(id: string): void
  has(id: string): boolean
  /** Every managed id paired with its pty pid — the input to rotation detection. */
  entries(): ManagedPty[]
  /** Re-key a still-living managed pty from its old session id to the new one (a `/clear` rotation),
   *  keeping the same pid. A no-op if `from` isn't managed or `to` is already a live managed id (so a
   *  rotation never clobbers another pty's entry) — matching the same guard the manager/store renames use. */
  rename(from: string, to: string): void
}

export function createManagedRegistry(): ManagedRegistry {
  const pidById = new Map<string, number>()
  return {
    add: (id, pid) => {
      pidById.set(id, pid)
    },
    remove: (id) => {
      pidById.delete(id)
    },
    has: (id) => pidById.has(id),
    entries: () => [...pidById].map(([id, pid]) => ({ id, pid })),
    rename: (from, to) => {
      const pid = pidById.get(from)
      if (pid === undefined || pidById.has(to)) return // `from` isn't managed, or `to` is already a live pty
      pidById.delete(from)
      pidById.set(to, pid)
    },
  }
}
