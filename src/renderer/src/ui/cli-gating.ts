import type { CliStatus, CliStatusByAgent } from "@shared/cli-status";
import { AGENTS, type AgentId } from "@shared/agents";
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

/** Per-agent gate over the by-agent status record — a missing entry (check pending) may spawn, same as
 *  spawnGate's null. Names the failing agent in `reason` rather than spawnGate's fixed Claude wording,
 *  so a Codex-specific failure doesn't surface as a Claude error. */
export function spawnGateFor(
  byAgent: CliStatusByAgent | null,
  agent: AgentId,
): SpawnGate {
  const gate = spawnGate(byAgent?.[agent] ?? null);
  if (gate.canSpawn) return gate;
  return {
    canSpawn: false,
    reason: tNow().settings.cli.unavailableReasonFor(AGENTS[agent].label),
  };
}
