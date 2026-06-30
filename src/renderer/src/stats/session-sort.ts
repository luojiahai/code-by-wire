import { tokensOf, type StatsBySession } from "@shared/stats";

/** The per-Session table's sortable columns. `tokens` follows the page's "Include cache" toggle (via
 *  tokensOf), so it sorts on the figure shown. */
export type SessionSortKey =
  | "session"
  | "model"
  | "lastActivity"
  | "duration"
  | "turns"
  | "tokens";

export type SortDir = "asc" | "desc";

export interface SessionSort {
  key: SessionSortKey;
  dir: SortDir;
}

/** The table's landing sort (#113): most recent activity first, matching the store's default row order. */
export const DEFAULT_SESSION_SORT: SessionSort = {
  key: "lastActivity",
  dir: "desc",
};

/** The direction a column sorts when first clicked: text ascending (A→Z reads naturally), everything else
 *  descending (biggest / most-recent on top, the figure you usually want surfaced). */
export function defaultDirFor(key: SessionSortKey): SortDir {
  return key === "session" || key === "model" ? "asc" : "desc";
}

/**
 * Sort the per-Session rows by the chosen column and direction, returning a NEW array (never mutating the
 * store's order). The tokens column reads the same fresh-vs-total figure the page's "Include cache" toggle
 * shows (via tokensOf), so the sort key always matches the visible number. A null model sorts as the
 * smallest value. Every comparison falls back to sessionId — kept ascending regardless of direction — so
 * equal rows hold a stable order and don't reshuffle when you flip direction.
 */
export function sortSessions(
  rows: readonly StatsBySession[],
  sort: SessionSort,
  includeCache: boolean,
): StatsBySession[] {
  const cmp = (a: StatsBySession, b: StatsBySession): number => {
    // Exhaustive over SessionSortKey with no default branch on purpose: adding a column without a case
    // here is a compile error (noImplicitReturns), not a silent fall-through to 0.
    switch (sort.key) {
      case "session":
        // The first column shows the session name (title, else the project basename) — sort on that same
        // effective string so the order matches what's on screen.
        return (a.title ?? a.project).localeCompare(b.title ?? b.project);
      case "model":
        return (a.modelRaw ?? "").localeCompare(b.modelRaw ?? "");
      case "lastActivity":
        return a.lastActivityMs - b.lastActivityMs;
      case "duration":
        return a.durationMs - b.durationMs;
      case "turns":
        return a.turns - b.turns;
      case "tokens":
        return tokensOf(a, includeCache) - tokensOf(b, includeCache);
    }
  };
  return [...rows].sort((a, b) => {
    const base = sort.dir === "asc" ? cmp(a, b) : -cmp(a, b);
    return base || a.sessionId.localeCompare(b.sessionId);
  });
}
