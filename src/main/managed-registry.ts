import type { Family } from "@shared/models";
import type { AgentId } from "@shared/agents";
import type { ManagedPty } from "./provider/claude/rotation";

/** Everything the app knows about a pty it spawned: the picked model alias (claude only), the
 *  agent, the spawn cwd, the spawn wall-clock (the codex claim's inputs, alongside cwd), and — for
 *  a codex Resume — the rollout path it's already claim-bound to (see `claimedRollout` below). */
export interface ManagedEntryInfo {
  model?: Family;
  agent: AgentId;
  cwd: string;
  spawnedAtMs: number;
  /** The rollout path this pty is claim-bound to AT registration (codex Resume: the pty id IS the
   *  rollout id, and an old rollout never enters the claim matcher's recent candidate window, so an
   *  unbound resume pty would sit pending forever and could mis-claim a fresh same-cwd rollout —
   *  see provider/codex/claim.ts). Undefined for fresh spawns, which claim later via `claim()`. */
  claimedRollout?: string;
}

export interface ManagedCodexPty {
  id: string;
  cwd: string;
  spawnedAtMs: number;
  claimedRollout?: string;
}

export interface ManagedEntrySnapshot extends ManagedEntryInfo {
  pid: number;
}

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
  /** Record a spawned id with its pty pid and the info the sync/claim logic needs: the agent, spawn
   *  cwd, spawn wall-clock, and (claude only) the picked model alias. Resume has no picked alias (the
   *  CLI restores the session's model), so `model` is omitted there. */
  add(id: string, pid: number, info: ManagedEntryInfo): void;
  remove(id: string): void;
  has(id: string): boolean;
  /** The alias this run spawned `id` on, or undefined for an unmanaged or model-less (resumed) id. Lets
   *  the provider front the picked model before the first assistant turn records a real one. */
  modelOf(id: string): Family | undefined;
  /** Which agent spawned `id`, or undefined if `id` isn't managed. */
  agentOf(id: string): AgentId | undefined;
  /** The cwd `id` was spawned in, or undefined if `id` isn't managed. */
  cwdOf(id: string): string | undefined;
  /** The rollout path claimed for `id`, or undefined if none has been bound yet. */
  claimedRolloutOf(id: string): string | undefined;
  /** A copied, report-safe snapshot of one live managed entry. */
  entryOf(id: string): ManagedEntrySnapshot | undefined;
  /** Every managed id paired with its pty pid, all agents. */
  entries(): ManagedPty[];
  /** Same, one agent — /clear rotation detection consumes entriesFor("claude") ONLY: a stale
   *  Claude registry file whose pid got reused by a codex pty must never read as a rotation. */
  entriesFor(agent: AgentId): ManagedPty[];
  /** The codex claim's inputs: live codex ptys with their spawn cwd/time and claim state. */
  codexEntries(): ManagedCodexPty[];
  /** Bind a discovered rollout file to a live codex pty (post-rename, under the rollout's id). */
  claim(id: string, rolloutPath: string): void;
  /** Rollout paths already bound to a live pty — the discovery-side duplicate suppressor. */
  claimedRollouts(): Set<string>;
  /** Re-key a still-living managed pty from its old session id to the new one (a `/clear` rotation),
   *  keeping the same pid and the whole info record (agent, cwd, spawnedAtMs, model, claimed rollout). A
   *  no-op if `from` isn't managed or `to` is already a live managed id (so a rotation never clobbers
   *  another pty's entry) — matching the same guard the manager/store renames use. */
  rename(from: string, to: string): void;
}

export function createManagedRegistry(): ManagedRegistry {
  // One entry per managed id: pid + its info travel together, so add/remove/rename touch a single map
  // and can't drift the pieces apart.
  const byId = new Map<
    string,
    { pid: number; info: ManagedEntryInfo; claimedRollout?: string }
  >();
  return {
    add: (id, pid, info) =>
      byId.set(id, { pid, info, claimedRollout: info.claimedRollout }),
    remove: (id) => byId.delete(id),
    has: (id) => byId.has(id),
    modelOf: (id) => byId.get(id)?.info.model,
    agentOf: (id) => byId.get(id)?.info.agent,
    cwdOf: (id) => byId.get(id)?.info.cwd,
    claimedRolloutOf: (id) => byId.get(id)?.claimedRollout,
    entryOf: (id) => {
      const entry = byId.get(id);
      return entry
        ? {
            ...entry.info,
            pid: entry.pid,
            claimedRollout: entry.claimedRollout,
          }
        : undefined;
    },
    entries: () => [...byId].map(([id, { pid }]) => ({ id, pid })),
    entriesFor: (agent) =>
      [...byId]
        .filter(([, e]) => e.info.agent === agent)
        .map(([id, { pid }]) => ({ id, pid })),
    codexEntries: () =>
      [...byId]
        .filter(([, e]) => e.info.agent === "codex")
        .map(([id, e]) => ({
          id,
          cwd: e.info.cwd,
          spawnedAtMs: e.info.spawnedAtMs,
          claimedRollout: e.claimedRollout,
        })),
    claim: (id, rolloutPath) => {
      const e = byId.get(id);
      if (e) e.claimedRollout = rolloutPath;
    },
    claimedRollouts: () =>
      new Set(
        [...byId.values()]
          .map((e) => e.claimedRollout)
          .filter((p): p is string => p !== undefined),
      ),
    rename: (from, to) => {
      const entry = byId.get(from);
      if (!entry || byId.has(to)) return; // `from` isn't managed, or `to` is already a live pty
      byId.delete(from);
      byId.set(to, entry);
    },
  };
}
