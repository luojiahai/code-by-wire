import { tokensOf, type StatsBySession } from "@shared/stats";

/** The per-Session table's sortable columns. `tokens` follows the page's cache toggle; `cost` is the
 *  Equivalent API value column (n/a rows sort below every real figure). */
export type SessionSortKey =
  | "project"
  | "model"
  | "lastActivity"
  | "duration"
  | "turns"
  | "tokens"
  | "cost";

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
  return key === "project" || key === "model" ? "asc" : "desc";
}

/**
 * Sort the per-Session rows by the chosen column and direction, returning a NEW array (never mutating the
 * store's order). The tokens column reads the same fresh-vs-total figure the page's "Include cache" toggle
 * shows, so the sort key always matches the visible number. A null cost or model sorts as the smallest
 * value, so n/a rows cluster at the bottom in descending order rather than scattering. Every comparison
 * falls back to sessionId — kept ascending regardless of direction — so equal rows hold a stable order and
 * don't reshuffle when you flip direction.
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
      case "project":
        return a.project.localeCompare(b.project);
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
      case "cost":
        // -1 sentinel keeps n/a (null) below every real figure, including a real $0.
        return (a.equivApiValueUsd ?? -1) - (b.equivApiValueUsd ?? -1);
    }
  };
  return [...rows].sort((a, b) => {
    const base = sort.dir === "asc" ? cmp(a, b) : -cmp(a, b);
    return base || a.sessionId.localeCompare(b.sessionId);
  });
}
