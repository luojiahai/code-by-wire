import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTextOrNull } from "./claude-config";
import type { ProjectPlacement, ProjectState } from "@shared/ipc";

export type { ProjectPlacement, ProjectState } from "@shared/ipc";

export interface ProjectStateStore {
  read(): ProjectState;
  setPlacement(key: string, placement: ProjectPlacement): void;
  /** Replace the whole state in one write — the startup repo-root remap, which must move several
   *  entries at once AND keep their original timestamps (a re-stamp would reshuffle pin order). */
  write(state: ProjectState): void;
}
export interface ProjectStateDeps {
  dir: string;
  now?: () => number;
}

export function createProjectStateStore(
  deps: ProjectStateDeps,
): ProjectStateStore {
  const file = join(deps.dir, "project-state.json");
  const now = deps.now ?? Date.now;
  function read(): ProjectState {
    const raw = readTextOrNull(file);
    if (raw === null) return {};
    try {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
      const result: ProjectState = {};
      for (const [key, entry] of Object.entries(value)) {
        if (!key || !entry || typeof entry !== "object" || Array.isArray(entry))
          continue;
        const { pinnedAtMs, hiddenAtMs } = entry as Record<string, unknown>;
        const validPin =
          typeof pinnedAtMs === "number" && Number.isFinite(pinnedAtMs);
        const validHide =
          typeof hiddenAtMs === "number" && Number.isFinite(hiddenAtMs);
        if (validPin === validHide) continue;
        result[key] = validPin
          ? { pinnedAtMs }
          : { hiddenAtMs: hiddenAtMs as number };
      }
      return result;
    } catch {
      return {};
    }
  }
  function write(state: ProjectState): void {
    mkdirSync(deps.dir, { recursive: true });
    writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
  }
  return {
    read,
    write,
    setPlacement(key, placement) {
      const next = read();
      if (placement === "ordinary") delete next[key];
      else if (placement === "pinned") next[key] = { pinnedAtMs: now() };
      else next[key] = { hiddenAtMs: now() };
      write(next);
    },
  };
}

/** When an entry was placed — pin and hide are mutually exclusive, so one of the two answers. */
function placedAtMs(entry: ProjectState[string]): number {
  return entry.pinnedAtMs ?? entry.hiddenAtMs ?? 0;
}

/**
 * Carry placements across the change of grouping identity: an entry keyed on a directory that now
 * resolves to a different repo root moves to that root. Without it a pin silently unpins and — the
 * worse case — a hidden folder silently reappears.
 *
 * `roots` is origin directory → repo root for the sessions that are actually live, so keys with no
 * live session are left alone rather than guessed at. When a repository and one of its
 * subdirectories both had an entry they now collide on one key: the newer timestamp wins, which the
 * store's pin/hide exclusivity leaves as a single valid entry either way.
 *
 * Returns null when nothing moved — the caller then writes nothing, which is what makes every
 * launch after the first a no-op.
 */
export function remapPlacements(
  state: ProjectState,
  roots: ReadonlyMap<string, string>,
): ProjectState | null {
  const next: ProjectState = { ...state };
  let moved = false;
  for (const [origin, root] of roots) {
    if (!origin || !root || origin === root) continue;
    const entry = state[origin];
    if (!entry) continue;
    delete next[origin];
    moved = true;
    // Compare against `next`, not `state`: an earlier iteration may already have moved a sibling
    // subdirectory's entry onto this same root.
    const existing = next[root];
    if (!existing || placedAtMs(entry) > placedAtMs(existing))
      next[root] = entry;
  }
  return moved ? next : null;
}
