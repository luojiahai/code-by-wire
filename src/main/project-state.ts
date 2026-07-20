import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTextOrNull } from "./claude-config";
import type { ProjectPlacement, ProjectState } from "@shared/ipc";

export type { ProjectPlacement, ProjectState } from "@shared/ipc";

export interface ProjectStateStore {
  read(): ProjectState;
  setPlacement(key: string, placement: ProjectPlacement): void;
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
  return {
    read,
    setPlacement(key, placement) {
      const next = read();
      if (placement === "ordinary") delete next[key];
      else if (placement === "pinned") next[key] = { pinnedAtMs: now() };
      else next[key] = { hiddenAtMs: now() };
      mkdirSync(deps.dir, { recursive: true });
      writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
    },
  };
}
