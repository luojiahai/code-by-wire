import { dirname, join } from "node:path";
import { readTextOrNull } from "../claude-config";

/** First defined `voice.enabled` in a settings file, or undefined when the file is absent/silent. */
function voiceFrom(path: string): boolean | undefined {
  const raw = readTextOrNull(path);
  if (raw === null) return undefined;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const voice = (j.voice ?? {}) as Record<string, unknown>;
    return typeof voice.enabled === "boolean" ? voice.enabled : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether voice input is enabled for a session, by Claude Code's layered settings precedence: the
 * project-local `.claude/settings.local.json` then `.claude/settings.json`, walking up from `cwd` to the
 * filesystem root, then the user-global `<claudeDir>/settings.json`. The first file that defines
 * `voice.enabled` wins. null when no layer defines it (the header row then hides — best-effort).
 */
export function readVoiceEnabled(
  cwd: string,
  claudeDir: string,
): boolean | null {
  let dir = cwd;
  // Walk up: each ancestor may carry a project .claude/.
  for (;;) {
    for (const file of ["settings.local.json", "settings.json"]) {
      const v = voiceFrom(join(dir, ".claude", file));
      if (v !== undefined) return v;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const userGlobal = voiceFrom(join(claudeDir, "settings.json"));
  return userGlobal ?? null;
}
