import type { CliStatus } from "@shared/cli-status";

export interface SpawnGate {
  canSpawn: boolean;
  reason: string | null;
}

/** notFound/unknown genuinely can't spawn; everything else (incl. the pending null) may, with the
 *  Sys lamp and caution banner carrying the caveat for outdated/loggedOut. */
export function spawnGate(status: CliStatus | null): SpawnGate {
  if (!status) return { canSpawn: true, reason: null };
  if (status.kind === "notFound" || status.kind === "unknown") {
    return {
      canSpawn: false,
      reason: "Claude Code CLI isn't usable — see Sys status in the title bar.",
    };
  }
  return { canSpawn: true, reason: null };
}
