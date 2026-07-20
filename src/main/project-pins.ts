import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTextOrNull } from "./claude-config";

export interface ProjectPinStore {
  read(): Record<string, number>;
  set(key: string, pinned: boolean): void;
}

export interface ProjectPinDeps {
  dir: string;
  now?: () => number;
}

export function createProjectPinStore(deps: ProjectPinDeps): ProjectPinStore {
  const file = join(deps.dir, "project-pins.json");
  const now = deps.now ?? Date.now;

  function read(): Record<string, number> {
    const raw = readTextOrNull(file);
    if (raw === null) return {};

    try {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
      return Object.fromEntries(
        Object.entries(value).filter(
          ([key, stamp]) =>
            key.length > 0 &&
            typeof stamp === "number" &&
            Number.isFinite(stamp),
        ),
      );
    } catch {
      return {};
    }
  }

  return {
    read,
    set(key, pinned) {
      const next = read();
      if (pinned) next[key] = now();
      else delete next[key];
      mkdirSync(deps.dir, { recursive: true });
      writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
    },
  };
}
