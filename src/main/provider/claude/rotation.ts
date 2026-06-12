/** One pty this app run spawned and controls, paired with the OS pid of its `claude` process. */
export interface ManagedPty {
  id: string;
  pid: number;
}

/** A `<pid>.json` registry file's identity: the live `claude` process and the session id it is
 *  currently writing. `/clear` repoints `sessionId` under the same `pid`. */
export interface RegistryEntry {
  pid: number;
  sessionId: string;
}

/** A managed pty whose Claude session id moved out from under it: same process, new transcript. */
export interface Rotation {
  from: string;
  to: string;
  pid: number;
}

/**
 * Detect the `/clear` rotations among our Managed ptys. A Managed session is anchored to its pty's
 * pid, not to the session id it happened to start with: `/clear` tears down the conversation and
 * starts a fresh Claude session under the SAME process, so `<pid>.json` repoints its `sessionId`
 * while the pid (and our pty) live on. We follow the process to the new id so the live session stays
 * Managed instead of being misread as a brand-new Observed one.
 *
 * A pid with no current registry entry yields NO rotation: absence is a (possibly transient) dead
 * process, which the alive→Ended path already handles. Only a present-but-different sessionId is a
 * rotation.
 */
export function detectRotations(
  managed: ManagedPty[],
  registry: RegistryEntry[],
): Rotation[] {
  const sessionByPid = new Map<number, string>();
  for (const r of registry) sessionByPid.set(r.pid, r.sessionId);

  const rotations: Rotation[] = [];
  for (const { id, pid } of managed) {
    const current = sessionByPid.get(pid);
    if (current !== undefined && current !== id)
      rotations.push({ from: id, to: current, pid });
  }
  return rotations;
}

/** The minimum a registry must expose for rotation reconciliation: its managed ptys and a way to re-key one. */
export interface RenamableRegistry {
  entries(): ManagedPty[];
  rename(from: string, to: string): void;
}

/**
 * Reconcile this run's Managed ptys against the on-disk session registry and follow every `/clear`
 * rotation: relabel the registry (so the provider's next sync calls the pty Managed under its new id and
 * leaves the abandoned id to derive as an Ended, adoptable ghost), then fire `rename` to re-key the live
 * pty and hand the rotation to the renderer. Runs before each sync, so the relabel lands the same tick.
 *
 * `readRegistry` is lazy: with no Managed pty this run, nothing can have rotated, so we skip the on-disk
 * read entirely — the common case (browsing Observed sessions, no terminal open) costs nothing.
 */
export function applyRotations(
  managed: RenamableRegistry,
  readRegistry: () => RegistryEntry[],
  rename: (from: string, to: string) => void,
): Rotation[] {
  const managedPtys = managed.entries();
  if (managedPtys.length === 0) return [];
  const rotations = detectRotations(managedPtys, readRegistry());
  for (const { from, to } of rotations) {
    managed.rename(from, to);
    rename(from, to);
  }
  return rotations;
}
