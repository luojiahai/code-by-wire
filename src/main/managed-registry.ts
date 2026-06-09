/**
 * The set of session ids THIS app run spawned and controls — the single authority for whether a
 * discovered session is Managed. The provider consults `has` when labelling; the terminal manager
 * calls `add` on spawn and `remove` when the pty dies (natural exit or window close). In-memory by
 * design: a Managed session lives only as long as its pty, so once that pty is gone the id is dropped
 * and discovery re-derives the session as Observed (Adopt, issue #14, is the path to resume it).
 */
export interface ManagedRegistry {
  add(id: string): void
  remove(id: string): void
  has(id: string): boolean
}

export function createManagedRegistry(): ManagedRegistry {
  const ids = new Set<string>()
  return {
    add: (id) => {
      ids.add(id)
    },
    remove: (id) => {
      ids.delete(id)
    },
    has: (id) => ids.has(id),
  }
}
