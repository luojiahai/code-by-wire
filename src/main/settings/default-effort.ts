import { join } from "node:path";
import { readTextOrNull } from "../claude-config";

/**
 * The user's global default thinking effort from `<claudeDir>/settings.json` (`effortLevel`) —
 * the LAST tier of the A6 chain: capture > transcript scan > this > "-". Best-effort, never
 * throws; read once per app run like readModelDefaults — edits apply on relaunch.
 */
export function readDefaultEffort(claudeDir: string): string | null {
  try {
    const raw = readTextOrNull(join(claudeDir, "settings.json"));
    if (raw === null) return null;
    const j = JSON.parse(raw) as Record<string, unknown>;
    return typeof j.effortLevel === "string" && j.effortLevel
      ? j.effortLevel
      : null;
  } catch {
    return null;
  }
}
