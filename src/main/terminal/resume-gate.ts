import type { AgentId } from "@shared/agents";

/** The resume target as the provider resolves it (see Provider.resolveResumeTarget). */
export interface ResumeTarget {
  alive: boolean;
  cwd: string;
  rolloutPath?: string;
}

export type ResumeDecision =
  | { ok: false; reason: "unresolvable" | "alive" }
  | { ok: true; cwd: string; agent: AgentId; claimedRollout?: string };

/**
 * The pure decision behind the terminal:resume handler — extracted so the refusal semantics are
 * unit-testable (terminal/ipc.ts value-imports electron and the native pty stack, so it can't load
 * under vitest). Refusals: no target (nothing resolves the id) or a live one (the liveness re-check
 * that guarantees two processes never share one transcript). A codex resume carries its rollout
 * path out as the claim binding the registry applies at registration (ResumeSpawn.claimedRollout).
 */
export function gateResume(
  agent: AgentId,
  target: ResumeTarget | null,
): ResumeDecision {
  if (!target) return { ok: false, reason: "unresolvable" };
  if (target.alive) return { ok: false, reason: "alive" };
  return {
    ok: true,
    cwd: target.cwd,
    agent,
    claimedRollout: agent === "codex" ? target.rolloutPath : undefined,
  };
}

export type ForkDecision =
  | { ok: false; reason: "unresolvable" }
  | { ok: true; cwd: string };

/**
 * The pure decision behind terminal:fork. Fork is claude-only — a non-claude source is refused
 * outright (belt-and-braces behind the renderer's canFork gate: a codex id reaching the handler
 * would otherwise spawn a broken `claude --resume <codexId> --fork-session`). No liveness gate —
 * a fork writes its own transcript, so it's safe even while the source is still running.
 */
export function gateFork(
  agent: AgentId,
  target: ResumeTarget | null,
): ForkDecision {
  if (agent !== "claude" || !target)
    return { ok: false, reason: "unresolvable" };
  return { ok: true, cwd: target.cwd };
}
