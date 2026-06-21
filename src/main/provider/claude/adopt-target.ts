import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { indexTranscripts, readRoot, registryById } from "./discover";
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

/**
 * Resolve just the working directory for a session, for actions that only need the folder (Open in).
 * Cheaper than resolveAdoptTarget: it skips the liveness probe, and its transcript fallback finds the
 * file by id with a direct per-project-dir probe instead of indexing every transcript in the home.
 * Prefers the registry's cwd (the freshest source), then the transcript's first recorded cwd (so a
 * reaped Ended session still resolves). Null when neither yields one.
 */
export function resolveSessionCwd({
  claudeDir,
  id,
}: {
  claudeDir: string;
  id: string;
}): string | null {
  const cwd = registryById(claudeDir).get(id)?.cwd;
  if (cwd) return cwd;

  const path = findTranscriptById(claudeDir, id);
  if (!path) return null;
  try {
    return firstTranscriptCwd(readFileSync(path, "utf8")) || null;
  } catch {
    return null;
  }
}

/**
 * Locate a session's transcript by id without building the whole transcript index: probe
 * `projects/<dir>/<id>.jsonl` in each project dir directly — one stat per dir, not one per transcript
 * file across the home. Returns the first match (the id's cwd is the same wherever its transcript
 * lives), or null when no project dir holds it.
 */
function findTranscriptById(claudeDir: string, id: string): string | null {
  const root = join(claudeDir, "projects");
  for (const proj of readRoot(root)) {
    const path = join(root, proj, `${id}.jsonl`);
    try {
      if (statSync(path).isFile()) return path;
    } catch {
      // not in this project dir; try the next
    }
  }
  return null;
}
