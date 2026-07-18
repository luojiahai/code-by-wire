import type { Family } from "@shared/models";
import type { ManagedPty } from "./provider/claude/rotation";

/**
 * The set of session ids THIS app run spawned and controls — the single authority for whether a
 * discovered session is Managed. The provider consults `has` when labelling; the terminal manager
 * calls `add` on spawn and `remove` when the pty dies (natural exit or window close). In-memory by
 * design: a Managed session lives only as long as its pty, so once that pty is gone the id is dropped
 * and discovery re-derives the session as Observed (Resume, issue #14, is the path back).
 *
 * Each id is anchored to its pty's `pid`, not just its name: `/clear` rotates the Claude session id
 * under the same process, so `entries`/`rename` let the sync follow a living pty to its new id instead
 * of losing it to Observed.
 */
export interface ManagedRegistry {
  /** Record a spawned id with its pty pid and, for a fresh spawn, the alias we picked for it. Resume has
   *  no picked alias (the CLI restores the session's model), so `model` is omitted there. */
  add(id: string, pid: number, model?: Family): void;
  remove(id: string): void;
  has(id: string): boolean;
  /** The alias this run spawned `id` on, or undefined for an unmanaged or model-less (resumed) id. Lets
   *  the provider front the picked model before the first assistant turn records a real one. */
  modelOf(id: string): Family | undefined;
  /** Every managed id paired with its pty pid — the input to rotation detection. */
  entries(): ManagedPty[];
  /** Re-key a still-living managed pty from its old session id to the new one (a `/clear` rotation),
   *  keeping the same pid and picked model. A no-op if `from` isn't managed or `to` is already a live
   *  managed id (so a rotation never clobbers another pty's entry) — matching the same guard the
   *  manager/store renames use. */
  rename(from: string, to: string): void;
}

export function createManagedRegistry(): ManagedRegistry {
  // One entry per managed id: pid + the picked alias travel together, so add/remove/rename touch a
  // single map and can't drift the two apart.
  const byId = new Map<string, { pid: number; model?: Family }>();
  return {
    add: (id, pid, model) => byId.set(id, { pid, model }),
    remove: (id) => byId.delete(id),
    has: (id) => byId.has(id),
    modelOf: (id) => byId.get(id)?.model,
    entries: () => [...byId].map(([id, { pid }]) => ({ id, pid })),
    rename: (from, to) => {
      const entry = byId.get(from);
      if (!entry || byId.has(to)) return; // `from` isn't managed, or `to` is already a live pty
      byId.delete(from);
      byId.set(to, entry);
    },
  };
}
