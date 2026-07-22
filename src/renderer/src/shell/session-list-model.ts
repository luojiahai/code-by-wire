import type { Session } from "@shared/types";
import { tNow } from "../i18n";
import type { SessionsListPreferences } from "./session-list-preferences";
import type { ProjectState } from "@shared/ipc";

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
  return sessions.filter((s) => sessionMatchesQuery(s, q));
}

function sessionMatchesQuery(
  session: Session,
  normalizedQuery: string,
): boolean {
  return (
    session.title.toLowerCase().includes(normalizedQuery) ||
    (session.project ?? "").toLowerCase().includes(normalizedQuery) ||
    (session.worktree?.repoLabel ?? "").toLowerCase().includes(normalizedQuery)
  );
}

/** The active-only toggle's filter (2026-07-04 sidebar spec §4): live sessions (working, waiting,
 *  idle) stay; ended drop. Order-preserving — composes before grouping, so a project whose sessions
 *  are all ended simply grows no group. */
export function filterActive(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.state !== "ended");
}

/** Label for sessions whose transcript carries no project path. Resolved from the live locale at
 *  call time via `tNow()` — this module is pure (no React), so it can't call `useI18n()`; never
 *  capture the string at module scope, or a locale switch wouldn't take effect. */
export function ungroupedLabel(): string {
  return tNow().shell.sessionList.ungrouped;
}

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

export interface SessionTreeNode {
  session: Session;
  children: SessionTreeNode[];
  /** All nested descendants, used for collapsed-family activity affordances. */
  descendantCount: number;
  activeDescendantCount: number;
}

/** The PINNED section's selection (2026-07-17 pinned-sessions spec): pinned sessions only, newest
 *  pin first. Composes AFTER filterSessions (search narrows pins too); the active-only filter is
 *  never applied here — pins are explicit favorites, so ended pins stay visible. */
export function pinnedSessions(sessions: Session[]): Session[] {
  return sessions
    .filter((s) => s.pinnedAtMs !== undefined)
    .sort((a, b) => (b.pinnedAtMs ?? 0) - (a.pinnedAtMs ?? 0));
}

/** The active-only toggle's group-level filter (2026-07-17 spec): every group survives — folders
 *  always render — but each group's rows narrow to live sessions. Runs AFTER grouping, so folder
 *  ordering derives from all (search-matched) sessions and toggling the filter never reshuffles
 *  folders; a group can come back empty, which the sidebar renders as a bare folder header. */
export function filterGroupsActive(groups: SessionGroup[]): SessionGroup[] {
  return groups.map((g) => ({
    ...g,
    sessions: filterSessionsWithAncestors(
      g.sessions,
      (session) => session.state !== "ended",
    ),
  }));
}

export function filterGroups(
  groups: SessionGroup[],
  preferences: SessionsListPreferences,
  query = "",
): SessionGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  const matchingGroups = groups.filter(
    (group) =>
      !normalizedQuery ||
      group.sessions.some((session) =>
        sessionMatchesQuery(session, normalizedQuery),
      ),
  );
  if (normalizedQuery) {
    const latestMatchByGroup = new Map(
      matchingGroups.map((group) => [
        group.key,
        Math.max(
          ...group.sessions
            .filter((session) => sessionMatchesQuery(session, normalizedQuery))
            .map((session) => session.lastActivityMs),
        ),
      ]),
    );
    matchingGroups.sort(
      (a, b) => latestMatchByGroup.get(b.key)! - latestMatchByGroup.get(a.key)!,
    );
  }
  return matchingGroups.map((group) => ({
    ...group,
    sessions: filterSessionsWithAncestors(group.sessions, (session) => {
      const matchesQuery =
        !normalizedQuery || sessionMatchesQuery(session, normalizedQuery);
      return (
        matchesQuery &&
        (preferences.visibility === "all" || session.state !== "ended") &&
        (preferences.agent === "all" || session.agent === preferences.agent)
      );
    }),
  }));
}

function filterSessionsWithAncestors(
  sessions: Session[],
  predicate: (session: Session) => boolean,
): Session[] {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const included = new Set<string>();
  for (const session of sessions) {
    if (!predicate(session)) continue;
    let current: Session | undefined = session;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      included.add(current.id);
      current = current.parentSessionId
        ? byId.get(current.parentSessionId)
        : undefined;
    }
  }
  return sessions.filter((session) => included.has(session.id));
}

function relationshipRoot(
  session: Session,
  byId: ReadonlyMap<string, Session>,
): Session {
  let current = session;
  const visited = new Set([session.id]);
  while (current.parentSessionId) {
    const parent = byId.get(current.parentSessionId);
    if (!parent) return current;
    if (visited.has(parent.id)) return session;
    visited.add(parent.id);
    current = parent;
  }
  return current;
}

function wouldCreateCycle(
  child: Session,
  parent: Session,
  byId: ReadonlyMap<string, Session>,
): boolean {
  let current: Session | undefined = parent;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    if (current.id === child.id) return true;
    visited.add(current.id);
    current = current.parentSessionId
      ? byId.get(current.parentSessionId)
      : undefined;
  }
  return false;
}

/** Reconstruct a display forest from the indexed Codex parent ids. Malformed cycles and missing
 * parents degrade to roots, so transcript corruption can never hide a selectable session. */
export function sessionForest(sessions: Session[]): SessionTreeNode[] {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const childrenById = new Map<string, Session[]>();
  const roots: Session[] = [];
  const sortKeys = new WeakMap<
    SessionTreeNode,
    { activeCreatedMs?: number; lastActivityMs: number }
  >();

  for (const session of sessions) {
    const parent = session.parentSessionId
      ? byId.get(session.parentSessionId)
      : undefined;
    if (!parent || wouldCreateCycle(session, parent, byId)) {
      roots.push(session);
      continue;
    }
    const children = childrenById.get(parent.id);
    if (children) children.push(session);
    else childrenById.set(parent.id, [session]);
  }

  const compareNodes = (a: SessionTreeNode, b: SessionTreeNode): number => {
    const aKeys = sortKeys.get(a)!;
    const bKeys = sortKeys.get(b)!;
    const aActive = aKeys.activeCreatedMs !== undefined;
    const bActive = bKeys.activeCreatedMs !== undefined;
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (aActive && bActive) {
      return bKeys.activeCreatedMs! - aKeys.activeCreatedMs!;
    }
    return bKeys.lastActivityMs - aKeys.lastActivityMs;
  };

  const build = (session: Session): SessionTreeNode => {
    const children = (childrenById.get(session.id) ?? []).map(build);
    children.sort(compareNodes);
    const descendantCount = children.reduce(
      (total, child) => total + 1 + child.descendantCount,
      0,
    );
    const activeDescendantCount = children.reduce(
      (total, child) =>
        total +
        (child.session.state === "ended" ? 0 : 1) +
        child.activeDescendantCount,
      0,
    );
    const node = {
      session,
      children,
      descendantCount,
      activeDescendantCount,
    };
    let activeCreatedMs =
      session.state === "ended" ? undefined : session.createdMs;
    let lastActivityMs = session.lastActivityMs;
    for (const child of children) {
      const childKeys = sortKeys.get(child)!;
      if (
        childKeys.activeCreatedMs !== undefined &&
        (activeCreatedMs === undefined ||
          childKeys.activeCreatedMs > activeCreatedMs)
      ) {
        activeCreatedMs = childKeys.activeCreatedMs;
      }
      lastActivityMs = Math.max(lastActivityMs, childKeys.lastActivityMs);
    }
    sortKeys.set(node, { activeCreatedMs, lastActivityMs });
    return node;
  };

  return roots.map(build).sort(compareNodes);
}

export function partitionProjectGroups(
  groups: SessionGroup[],
  state: ProjectState,
): { pinned: SessionGroup[]; others: SessionGroup[]; hidden: SessionGroup[] } {
  const pinned = groups
    .filter(
      (group) =>
        group.cwd !== undefined && state[group.key]?.pinnedAtMs !== undefined,
    )
    .sort(
      (a, b) =>
        (state[b.key]?.pinnedAtMs ?? 0) - (state[a.key]?.pinnedAtMs ?? 0),
    );
  const hidden = groups
    .filter(
      (group) =>
        group.cwd !== undefined && state[group.key]?.hiddenAtMs !== undefined,
    )
    .sort(
      (a, b) =>
        (state[b.key]?.hiddenAtMs ?? 0) - (state[a.key]?.hiddenAtMs ?? 0),
    );
  const others = groups.filter(
    (group) =>
      group.cwd === undefined ||
      (state[group.key]?.pinnedAtMs === undefined &&
        state[group.key]?.hiddenAtMs === undefined),
  );
  return { pinned, others, hidden };
}

/** Every project group controlled by the Sessions header's expand/collapse-all button. Hidden
 * groups participate even while their separate disclosure is closed, so opening it later reveals
 * the same global collapse state as pinned and ordinary groups. */
export function projectGroupsForCollapse(
  pinned: SessionGroup[],
  others: SessionGroup[],
  hidden: SessionGroup[],
): SessionGroup[] {
  return [...pinned, ...others, ...hidden];
}

export function toggleProjectGroups(
  collapsed: ReadonlySet<string>,
  groups: SessionGroup[],
): ReadonlySet<string> {
  const next = new Set(collapsed);
  const allCollapsed =
    groups.length > 0 && groups.every((group) => collapsed.has(group.key));
  for (const group of groups) {
    if (allCollapsed) next.delete(group.key);
    else next.add(group.key);
  }
  return next;
}

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
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const buckets = new Map<
    string,
    { cwd?: string; label: string; sessions: Session[] }
  >();
  for (const s of sessions) {
    const groupingSession = relationshipRoot(s, byId);
    // A worktree session groups under its main checkout: root as the key (and the quick-add cwd),
    // repo name as the label. A main-checkout session in the same repo produces the identical
    // bucket values, so merge order doesn't matter.
    const cwd =
      groupingSession.worktree?.repoRoot ?? (groupingSession.cwd || undefined);
    const label =
      groupingSession.worktree?.repoLabel ??
      (groupingSession.project || ungroupedLabel());
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
