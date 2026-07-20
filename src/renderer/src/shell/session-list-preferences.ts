import { AGENT_IDS, type AgentId } from "@shared/agents";

const STORAGE_KEY = "cbw.sessionsList.v2";
const LEGACY_ACTIVE_ONLY_KEY = "cbw.sessionsActiveOnly.v1";

export const DEFAULT_SESSIONS_LIST_PREFERENCES = {
  visibility: "all",
  showAgentIcons: true,
  agent: "all",
} as const;

export type SessionsListPreferences = {
  visibility: "all" | "active";
  showAgentIcons: boolean;
  agent: "all" | AgentId;
};

export function loadSessionsListPreferences(
  storage: Storage,
): SessionsListPreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
      const migrated = {
        ...DEFAULT_SESSIONS_LIST_PREFERENCES,
        visibility:
          storage.getItem(LEGACY_ACTIVE_ONLY_KEY) === "true"
            ? ("active" as const)
            : ("all" as const),
      };
      saveSessionsListPreferences(storage, migrated);
      return migrated;
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null)
      return { ...DEFAULT_SESSIONS_LIST_PREFERENCES };
    const value = parsed as Record<string, unknown>;
    return {
      visibility:
        value.visibility === "active" || value.visibility === "all"
          ? value.visibility
          : DEFAULT_SESSIONS_LIST_PREFERENCES.visibility,
      showAgentIcons:
        typeof value.showAgentIcons === "boolean"
          ? value.showAgentIcons
          : DEFAULT_SESSIONS_LIST_PREFERENCES.showAgentIcons,
      agent:
        value.agent === "all" || AGENT_IDS.includes(value.agent as AgentId)
          ? (value.agent as "all" | AgentId)
          : DEFAULT_SESSIONS_LIST_PREFERENCES.agent,
    };
  } catch {
    return { ...DEFAULT_SESSIONS_LIST_PREFERENCES };
  }
}

export function saveSessionsListPreferences(
  storage: Storage,
  value: SessionsListPreferences,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be disabled or full; preferences remain usable in memory.
  }
}
