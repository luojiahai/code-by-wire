import type { Session } from "@shared/types";

/** One flat list, no visible section split: live sessions first (newest-created first), then
 *  ended sessions appended (most-recently-active first) — see design spec §4. */
export function sortSessions(sessions: Session[]): Session[] {
  const active = sessions
    .filter((s) => s.state !== "ended")
    .sort((a, b) => b.createdMs - a.createdMs);
  const ended = sessions
    .filter((s) => s.state === "ended")
    .sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  return [...active, ...ended];
}

/** Case-insensitive substring match on title or project — the sidebar search box's filter. */
export function filterSessions(sessions: Session[], query: string): Session[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      (s.project ?? "").toLowerCase().includes(q),
  );
}

/** The active-only toggle's filter (2026-07-04 sidebar spec §4): live sessions (working, waiting,
 *  idle) stay; ended drop. Order-preserving — composes before grouping, so a project whose sessions
 *  are all ended simply grows no group. */
export function filterActive(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.state !== "ended");
}

/** Label for sessions whose transcript carries no project path. */
export const UNGROUPED_LABEL = "(no project)";

export type SessionGroup = { project: string; sessions: Session[] };

/** Hermes-style sidebar grouping (design spec §left-sidebar): one group per project, ordered by
 *  the group's most recent activity; inside a group, sessions keep the flat list's sort. */
export function groupSessionsByProject(sessions: Session[]): SessionGroup[] {
  const byProject = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = s.project || UNGROUPED_LABEL;
    const bucket = byProject.get(key);
    if (bucket) bucket.push(s);
    else byProject.set(key, [s]);
  }
  return [...byProject.entries()]
    .map(([project, members]) => ({ project, sessions: sortSessions(members) }))
    .sort(
      (a, b) =>
        Math.max(...b.sessions.map((s) => s.lastActivityMs)) -
        Math.max(...a.sessions.map((s) => s.lastActivityMs)),
    );
}
