import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Whether a remote-control bridge is attached to a session. Claude Code writes one manifest per live
 * process under `<claudeDir>/sessions/<pid>.json`; we scan for the manifest whose `sessionId` matches and
 * report whether its `bridgeSessionId` is a non-empty string. null when no manifest matches (best-effort:
 * the row hides rather than asserting a misleading "off").
 */
export function readRemoteControl(
  claudeDir: string,
  sessionId: string,
): boolean | null {
  const dir = join(claudeDir, "sessions");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const j = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<
        string,
        unknown
      >;
      if (j.sessionId !== sessionId) continue;
      const bridge = j.bridgeSessionId;
      return typeof bridge === "string" && bridge.length > 0;
    } catch {
      // skip a malformed / half-written manifest
    }
  }
  return null;
}
