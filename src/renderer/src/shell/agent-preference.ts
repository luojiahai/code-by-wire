import { AGENT_IDS, type AgentId } from "@shared/agents";

const STORAGE_KEY = "cbw.lastAgent.v1";

/** The agent last chosen at spawn time (issue #420): the new-session form and the folder "+"
 *  default to it, so a single-agent habit never pays a per-launch choice. */
export function loadLastAgent(storage: Storage): AgentId | undefined {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return AGENT_IDS.includes(raw as AgentId) ? (raw as AgentId) : undefined;
  } catch {
    return undefined;
  }
}

export function saveLastAgent(storage: Storage, agent: AgentId): void {
  try {
    storage.setItem(STORAGE_KEY, agent);
  } catch {
    // Storage can be disabled or full; the default just stays session-local.
  }
}

/** The agent a no-choice launch uses: last-used when its CLI can still spawn, else the first
 *  spawnable agent, else "claude" (spawn gates keep the buttons disabled in that state anyway). */
export function resolveDefaultAgent(
  spawnable: readonly AgentId[],
  lastUsed: AgentId | undefined,
): AgentId {
  if (lastUsed && spawnable.includes(lastUsed)) return lastUsed;
  return spawnable[0] ?? "claude";
}

/** resolveDefaultAgent against the live CLI gates and the persisted last-used agent — the one
 *  call every no-choice launch site shares. */
export function defaultSpawnAgent(
  canSpawnFor: (agent: AgentId) => boolean,
): AgentId {
  return resolveDefaultAgent(
    AGENT_IDS.filter(canSpawnFor),
    loadLastAgent(window.localStorage),
  );
}
