import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  emptyLaunchPresets,
  type LaunchPreset,
  type LaunchPresets,
} from "@shared/extra-args";
import { isAgentId } from "@shared/agents";
import { readTextOrNull } from "./claude-config";

/**
 * Named launch-args presets per agent (the New-session preset picker). Whole-object read/write:
 * the renderer owns list edits (save/overwrite/delete are read-modify-write in its state) and
 * ships the full object back, so the store stays a dumb durable mirror. Stored under Electron's
 * userData beside launch-args.json.
 */
export interface LaunchPresetStore {
  /** Every preset, all agents keyed. Empty lists when the file is absent or corrupt. */
  read(): LaunchPresets;
  /** Replace the whole presets object. */
  write(p: LaunchPresets): void;
}

function sanitizeList(v: unknown): LaunchPreset[] {
  if (!Array.isArray(v)) return [];
  const out: LaunchPreset[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const { name, args } = item as Record<string, unknown>;
    if (typeof name === "string" && typeof args === "string")
      out.push({ name, args });
  }
  return out;
}

export function createLaunchPresetStore(deps: {
  dir: string;
}): LaunchPresetStore {
  const file = join(deps.dir, "launch-presets.json");

  return {
    read(): LaunchPresets {
      const base = emptyLaunchPresets();
      const raw = readTextOrNull(file);
      if (raw === null) return base;
      try {
        const v: unknown = JSON.parse(raw);
        if (!v || typeof v !== "object" || Array.isArray(v)) return base;
        for (const [k, list] of Object.entries(v))
          if (isAgentId(k)) base[k] = sanitizeList(list);
        return base;
      } catch {
        return base; // corrupt file reads as "no presets"
      }
    },
    write(p: LaunchPresets): void {
      mkdirSync(deps.dir, { recursive: true });
      writeFileSync(file, JSON.stringify(p, null, 2) + "\n");
    },
  };
}
