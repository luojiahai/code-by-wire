import { join } from "node:path";
import { readTextOrNull } from "../claude-config";

/** Claude Code's own cleanupPeriodDays default: transcripts are retained for 30 days. */
const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The sidebar's ended-session window: the user's own `cleanupPeriodDays` from
 * `<claudeDir>/settings.json`, in ms — so the list shows exactly what still exists on disk
 * and a session disappears only when Claude Code itself is due to delete it (#280). Valid
 * when a finite number ≥ 0: `0` honored as-is (delete-immediately mirrors disk), fractional
 * days fine. Anything else — absent file or key, wrong type, negative, malformed JSON, a
 * read failure — falls back to Claude's 30-day default. Best-effort, never throws: a broken
 * settings.json must not take down provider construction. Read once per app run, like
 * readModelDefaults — edits apply on relaunch.
 */
export function readSessionWindowMs(claudeDir: string): number {
  try {
    const raw = readTextOrNull(join(claudeDir, "settings.json"));
    if (raw === null) return DEFAULT_WINDOW_MS;
    const j = JSON.parse(raw) as Record<string, unknown>;
    const days = j.cleanupPeriodDays;
    if (typeof days !== "number" || !Number.isFinite(days) || days < 0)
      return DEFAULT_WINDOW_MS;
    return days * 24 * 60 * 60 * 1000;
  } catch {
    return DEFAULT_WINDOW_MS; // non-ENOENT read error, bad JSON, or a null root — default, never throw
  }
}
