import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve the Codex home dir: an explicit override, else `CODEX_HOME`, else `~/.codex` — the
 *  same shape as resolveClaudeDir, minus the login-shell recovery (codex has no equivalent yet). */
export function resolveCodexDir(override?: string): string {
  return override ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
}
