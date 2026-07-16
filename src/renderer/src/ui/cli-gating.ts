import type { CliStatus } from "@shared/cli-status";
import { tNow } from "../i18n";

export interface SpawnGate {
  canSpawn: boolean;
  reason: string | null;
}

/** notFound/unknown genuinely can't spawn; everything else (incl. the pending null) may, with the
 *  Sys lamp and caution banner carrying the caveat for outdated/loggedOut. `reason` surfaces verbatim
 *  as an Error message shown in the New-session view, so it's resolved from the live locale via
 *  `tNow()` inside the call — never captured at module scope. */
export function spawnGate(status: CliStatus | null): SpawnGate {
  if (!status) return { canSpawn: true, reason: null };
  if (status.kind === "notFound" || status.kind === "unknown") {
    return {
      canSpawn: false,
      reason: tNow().settings.cli.unavailableReason,
    };
  }
  return { canSpawn: true, reason: null };
}
