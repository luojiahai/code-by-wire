import { dirname, join } from "node:path";
import { readTextOrNull } from "../claude-config";

/**
 * The logged-in account email from `.claude.json`. Claude Code writes this file as a sibling of the
 * config dir (`~/.claude.json` for the default `~/.claude`), or inside `CLAUDE_CONFIG_DIR`. We check the
 * sibling first, then inside the dir, and read `oauthAccount.emailAddress`. Best-effort: any absence or
 * malformation returns null (the popover hides the row), never throws.
 */
export function readAccountEmail(claudeDir: string): string | null {
  const candidates = [
    join(dirname(claudeDir), ".claude.json"),
    join(claudeDir, ".claude.json"),
  ];
  for (const path of candidates) {
    const raw = readTextOrNull(path);
    if (raw === null) continue;
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      const oauth = (j.oauthAccount ?? {}) as Record<string, unknown>;
      const email = oauth.emailAddress;
      if (typeof email === "string" && email.length > 0) return email;
    } catch {
      // malformed JSON — try the next candidate, then give up
    }
  }
  return null;
}
