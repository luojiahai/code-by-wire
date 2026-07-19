/** The coding agents this app can spawn and track. Adding an agent (OpenCode, Copilot, …) means:
 *  one id here, one descriptor below, one provider under src/main/provider/<agent>/, one spawn
 *  branch in terminal/command.ts, one probe spec in main/cli-status.ts, one settings card, one
 *  icon in ui/agent-icons.tsx. Every picker/dropdown/menu iterates AGENT_IDS — never a hardcoded
 *  pair — so the surfaces pick a new agent up from here alone. */
export const AGENT_IDS = ["claude", "codex"] as const;

export type AgentId = (typeof AGENT_IDS)[number];

/** What an agent's integration can do TODAY. Renderer surfaces gate on these flags — never on the
 *  agent id — so enabling a surface for a new agent is a provider implementation plus a flag flip
 *  here, with zero new wiring in the surfaces. Flags decide WHETHER a surface exists for an agent;
 *  what's INSIDE a surface lives in per-agent compositions (e.g. the right sidebar's panel stacks
 *  in renderer shell/sidebar/), one file per agent. */
export interface AgentCapabilities {
  /** Main can steer the agent's session lifecycle beyond its own pty (Claude: registry files). */
  canControl: boolean;
  /** Sessions report account rate-limit windows (Claude: statusline captures). */
  hasRateLimits: boolean;
  /** Sessions have subagent transcripts to reconstruct. */
  hasSubagents: boolean;
  /** The transcript view renders for this agent's sessions (header Transcript segment). */
  hasTranscript: boolean;
  /** Resume (relaunch under the same session id) is wired. */
  canResume: boolean;
  /** Fork (resume into a new id) is wired. */
  canFork: boolean;
  /** The bottom ACTIVITY dock (tasks/subagents/shells/monitors) has data for this agent. */
  hasActivity: boolean;
  /** The right-sidebar telemetry stack (pressure/spend/speed/git) has data for this agent. */
  hasTelemetry: boolean;
  /** The new-session form offers a model picker (spawn takes a --model flag). */
  hasModelPicker: boolean;
  /** The Settings → System page shows the Stats database card for this agent. */
  hasStatsDb: boolean;
}

export interface AgentDescriptor {
  id: AgentId;
  /** Branded product name — shown verbatim in every locale, never translated. */
  label: string;
  /** The bare command name spawned through the login shell / PATHEXT shim. */
  binary: string;
  capabilities: AgentCapabilities;
}

const ALL = {
  canControl: true,
  hasRateLimits: true,
  hasSubagents: true,
  hasTranscript: true,
  canResume: true,
  canFork: true,
  hasActivity: true,
  hasTelemetry: true,
  hasModelPicker: true,
  hasStatsDb: true,
} as const satisfies AgentCapabilities;

const NONE = {
  canControl: false,
  hasRateLimits: false,
  hasSubagents: false,
  hasTranscript: false,
  canResume: false,
  canFork: false,
  hasActivity: false,
  hasTelemetry: false,
  hasModelPicker: false,
  hasStatsDb: false,
} as const satisfies AgentCapabilities;

export const AGENTS: Record<AgentId, AgentDescriptor> = {
  claude: {
    id: "claude",
    label: "Claude Code",
    binary: "claude",
    capabilities: ALL,
  },
  // codex: Resume (the provider resolves rollout targets; the terminal spawns `codex resume
  // <id>`, claim-bound at registration). Activity/subagents/fork still gated off; future work
  // flips more flags as provider readers land — the surfaces need no edits.
  codex: {
    id: "codex",
    label: "Codex",
    binary: "codex",
    capabilities: {
      ...NONE,
      hasTranscript: true,
      hasTelemetry: true,
      hasRateLimits: true,
      canResume: true,
    },
  },
};

export function isAgentId(v: unknown): v is AgentId {
  return typeof v === "string" && (AGENT_IDS as readonly string[]).includes(v);
}

/** Legacy rows/requests with no (or an unknown) agent are Claude — the only agent that existed. */
export function agentOrDefault(v: unknown): AgentId {
  return isAgentId(v) ? v : "claude";
}
