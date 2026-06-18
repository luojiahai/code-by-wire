import type { Session } from "./types";

/** The rail's two zones. Active is every non-ended session (waiting + working + idle merged); Ended is
 *  the archive. They sort on different keys on purpose: Active by creation time so a row never moves as
 *  it works, Ended by last activity so the most recently finished sits on top. */
export interface RailSections {
  active: Session[];
  ended: Session[];
}

const matchesQuery = (s: Session, q: string): boolean =>
  !q ||
  s.title.toLowerCase().includes(q) ||
  s.project.toLowerCase().includes(q);

/**
 * Split sessions into the rail's Active and Ended zones, filtered by a case-insensitive substring over
 * title + project. Active is newest-created first (id breaks ties for a stable order); Ended is
 * most-recently-active first. Pure; returns fresh arrays.
 */
export function railSections(sessions: Session[], query: string): RailSections {
  const q = query.trim().toLowerCase();
  const visible = sessions.filter((s) => matchesQuery(s, q));
  const active = visible
    .filter((s) => s.state !== "ended")
    .sort((a, b) => b.createdMs - a.createdMs || a.id.localeCompare(b.id));
  const ended = visible
    .filter((s) => s.state === "ended")
    .sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  return { active, ended };
}

/** The rail's full render order as one flat list: Active (newest-created first) then Ended. Used to pick
 *  the visually-top row for auto-selection. */
export function orderedSessions(sessions: Session[], query: string): Session[] {
  const { active, ended } = railSections(sessions, query);
  return [...active, ...ended];
}
