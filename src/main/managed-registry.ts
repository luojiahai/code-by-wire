/**
 * The set of session ids THIS app run spawned and controls — the single authority for whether a
 * discovered session is Managed. The provider consults `has` when labelling; the terminal manager
 * calls `add` on spawn. In-memory by design: a Managed session lives only as long as its pty, which
 * dies with the app, so after a restart its id is gone and discovery re-derives it as Observed (Adopt,
 * issue #14, is the path to resume it).
 */
export interface ManagedRegistry {
  add(id: string): void
  has(id: string): boolean
}

export function createManagedRegistry(): ManagedRegistry {
  const ids = new Set<string>()
  return {
    add: (id) => {
      ids.add(id)
    },
    has: (id) => ids.has(id),
  }
}
