import { readFileSync } from "node:fs";
import { indexTranscripts, registryById } from "./discover";
import { firstTranscriptCwd } from "./transcript";

export interface AdoptTargetDeps {
  claudeDir: string;
  isPidAlive: (pid: number) => boolean;
  id: string;
}

/**
 * Resolve what Adopt needs to safely resume a session: whether any live process still owns it (the
 * liveness re-check that backs the Ended-only state gate) and the working directory to relaunch it in.
 * The registry entry is the freshest one for the id — the same one `listCandidates` derives the UI's
 * `alive` from, so the gate and the displayed state agree. cwd comes from that entry, else from the
 * Transcript, which records `cwd` on every row — so a reaped registry file (the common Ended case) still
 * yields it. Null when neither source gives a cwd: there is nothing to adopt.
 */
export function resolveAdoptTarget({
  claudeDir,
  isPidAlive,
  id,
}: AdoptTargetDeps): { alive: boolean; cwd: string } | null {
  const reg = registryById(claudeDir).get(id);
  const alive = reg ? isPidAlive(reg.pid) : false;

  let cwd = reg?.cwd ?? "";
  if (!cwd) {
    const t = indexTranscripts(claudeDir).get(id);
    if (t) {
      try {
        cwd = firstTranscriptCwd(readFileSync(t.path, "utf8"));
      } catch {
        cwd = "";
      }
    }
  }
  return cwd ? { alive, cwd } : null;
}
