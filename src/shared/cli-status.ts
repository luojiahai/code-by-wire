import type { AgentId } from "./agents";

/** The five CLI verdicts, in classification precedence (notFound wins, ready loses). */
export type CliStatusKind =
  | "notFound"
  | "unknown"
  | "outdated"
  | "loggedOut"
  | "ready";

export interface CliStatus {
  kind: CliStatusKind;
  /** Parsed version string, or null when not found / unparsable. */
  version: string | null;
  /** The version floor in effect (the agent's AgentProbeSpec.floor), shown in the modal. null when the
   *  agent's probe has no minimum-version gate (e.g. codex). */
  floor: string | null;
  /** Where this app reads the agent's own transcripts/settings from — display only. */
  configDir: { active: string };
  /** Human-readable one-liner for the footer/modal (e.g. "needs ≥ 2.0.0"). */
  detail?: string;
  checkedAt: number;
}

/** One cached CLI verdict per agent, keyed like AGENT_IDS. A missing key or a null value both mean "no
 *  completed check yet" — Partial because a controller may not have run (or finished) every agent's
 *  check at the point an overview is read. */
export type CliStatusByAgent = Partial<Record<AgentId, CliStatus | null>>;
