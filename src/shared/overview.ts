import type { Session, SessionState } from "./types";

/** Default-sort precedence + display order: Waiting loudest, then Working, Idle, Ended. */
export const STATE_ORDER: Record<SessionState, number> = {
  waiting: 0,
  working: 1,
  idle: 2,
  ended: 3,
};

/** SessionStates in display order, derived from STATE_ORDER — the one source of state ordering the
 *  rail's groups read from, so adding a state is a single STATE_ORDER edit. */
export const ORDERED_STATES = (Object.keys(STATE_ORDER) as SessionState[]).sort(
  (a, b) => STATE_ORDER[a] - STATE_ORDER[b],
);

export interface SessionGroup {
  state: SessionState;
  items: Session[];
}

/**
 * Group sessions for the master rail: by state in display order (Waiting → Working → Idle → Ended),
 * filtered by a case-insensitive substring over title + project, each group's items most-recent first,
 * empty groups dropped. Pure; returns fresh arrays.
 */
export function groupSessions(
  sessions: Session[],
  query: string,
): SessionGroup[] {
  const q = query.trim().toLowerCase();
  const match = (s: Session): boolean =>
    !q ||
    s.title.toLowerCase().includes(q) ||
    s.project.toLowerCase().includes(q);
  return ORDERED_STATES.map((state) => ({
    state,
    items: sessions
      .filter((s) => s.state === state && match(s))
      .sort((a, b) => b.lastActivityMs - a.lastActivityMs),
  })).filter((g) => g.items.length > 0);
}
