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

/** Case-insensitive substring match on title, project, or merged repo label (so searching a repo's
 *  name also finds its worktree sessions) — the sidebar search box's filter. */
export function filterSessions(sessions: Session[], query: string): Session[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      (s.project ?? "").toLowerCase().includes(q) ||
      (s.worktree?.repoLabel ?? "").toLowerCase().includes(q),
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

export type SessionGroup = {
  /** Grouping identity: the cwd when known, else the name fallback. Collapse state keys on this. */
  key: string;
  /** The group's full path; absent for name-keyed fallback groups (no session knew its cwd). */
  cwd?: string;
  /** Folder name, as before — main already computed basename(cwd) into `project`. */
  label: string;
  /** Dimmed parent-path hint (e.g. "~/a"), set only when 2+ groups share a label. */
  hint?: string;
  sessions: Session[];
};

/** The parent directory of `cwd`, with a leading homeDir abbreviated to `~`:
 *  "/Users/x/a/test" → "~/a". Absolute when outside home; raw parent when homeDir is unknown.
 *  Pure string math on posix separators (the app targets macOS chrome). */
export function parentHint(cwd: string, homeDir: string): string {
  const parent = cwd.slice(0, cwd.lastIndexOf("/")) || "/";
  if (homeDir && parent === homeDir) return "~";
  if (homeDir && parent.startsWith(homeDir + "/"))
    return "~" + parent.slice(homeDir.length);
  return parent;
}

/** Hermes-style sidebar grouping (design spec §left-sidebar), keyed by full working directory so
 *  two same-named folders at different paths stay separate (2026-07-04 spec §3). One group per
 *  cwd — sessions with no known cwd fall back to a name-keyed group, degrading to the old
 *  behavior. Groups order by most recent activity; inside a group, sessions keep the flat sort.
 *  When 2+ groups share a label, each path-keyed one carries a `hint` (its ~-abbreviated parent)
 *  so the sidebar can tell them apart.
 *  Worktree sessions key on their main checkout's root (2026-07-09 worktree-merge spec), so a repo
 *  and its linked worktrees form one group. */
export function groupSessionsByProject(
  sessions: Session[],
  homeDir = "",
): SessionGroup[] {
  const buckets = new Map<
    string,
    { cwd?: string; label: string; sessions: Session[] }
  >();
  for (const s of sessions) {
    // A worktree session groups under its main checkout: root as the key (and the quick-add cwd),
    // repo name as the label. A main-checkout session in the same repo produces the identical
    // bucket values, so merge order doesn't matter.
    const cwd = s.worktree?.repoRoot ?? (s.cwd || undefined);
    const label = s.worktree?.repoLabel ?? (s.project || UNGROUPED_LABEL);
    const key = cwd ?? label;
    const bucket = buckets.get(key);
    if (bucket) bucket.sessions.push(s);
    else buckets.set(key, { cwd, label, sessions: [s] });
  }
  const groups = [...buckets.entries()].map(([key, b]) => ({
    key,
    cwd: b.cwd,
    label: b.label,
    sessions: sortSessions(b.sessions),
  }));
  const labelCounts = new Map<string, number>();
  for (const g of groups)
    labelCounts.set(g.label, (labelCounts.get(g.label) ?? 0) + 1);
  return groups
    .map((g) =>
      (labelCounts.get(g.label) ?? 0) > 1 && g.cwd
        ? { ...g, hint: parentHint(g.cwd, homeDir) }
        : g,
    )
    .sort(
      (a, b) =>
        Math.max(...b.sessions.map((s) => s.lastActivityMs)) -
        Math.max(...a.sessions.map((s) => s.lastActivityMs)),
    );
}
