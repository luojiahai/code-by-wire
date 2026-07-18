import type { Session } from "./types";

/**
 * Merge freshly-discovered sessions with optimistic Managed drafts (sessions the app spawned this run
 * that discovery hasn't indexed yet). A real row always wins over a draft of the same id, so the moment
 * discovery sees the spawned process the draft is shadowed; drafts with no real row yet are appended.
 * That keeps a just-created Managed session visible in the Overview and openable during the gap between
 * spawn and Claude writing its registry file + transcript.
 */
export function mergeManaged(
  sessions: Session[],
  drafts: Session[],
): Session[] {
  const real = new Set(sessions.map((s) => s.id));
  return [...sessions, ...drafts.filter((d) => !real.has(d.id))];
}

/**
 * Re-point a row's id after a `/clear` rotation (the live pty moved from `from` to `to`). Applied to BOTH
 * the discovered list and the optimistic drafts, so a rotated Managed session follows to its new id no
 * matter which list still carries the old one — drafts when no sync has indexed it yet (a `/clear` right
 * after spawn, before any prompt), the discovered list once it has. The row is marked Managed because the
 * rotation target is always this run's live pty.
 *
 * Guard: when a row for `to` already exists in the SAME list, leave the list untouched. For the discovered
 * list that means `from` is the abandoned id's Ended ghost, which must survive; for drafts the rename has
 * already happened. Without it, the rename would duplicate `to` and erase the ghost.
 */
export function renameManaged(
  rows: Session[],
  from: string,
  to: string,
): Session[] {
  if (rows.some((r) => r.id === to)) return rows;
  return rows.map((r) =>
    r.id === from ? { ...r, id: to, management: "managed" } : r,
  );
}

/**
 * Migrate a Resume override across a `/clear` rotation (the live pty moved from `from` to `to`). If the
 * rotated id was resuming — its optimistic Managed/Working overlay still pending the next sync — move the
 * override onto the new id: the live pty under `to` keeps the overlay until discovery confirms it Managed,
 * while `from` (about to derive as an Ended ghost) drops it. Without this, the abandoned id keeps being
 * forced Managed/Working and lingers as a phantom session, no longer resumable, for the rest of the run.
 * No-op (same reference) when `from` wasn't resuming.
 */
export function renameResuming(
  resuming: Set<string>,
  from: string,
  to: string,
): Set<string> {
  if (!resuming.has(from)) return resuming;
  const next = new Set(resuming);
  next.delete(from);
  next.add(to);
  return next;
}

/**
 * Which resume overrides discovery has caught up on, so App can drop them. An override is done only once
 * the real row reads BOTH Managed AND no longer Ended. Management flips to Managed the instant the app's
 * pty spawns (the in-memory managed registry), but the session's on-disk live pid lags until
 * `claude --resume` boots and writes its registry file — so a just-resumed row briefly reads Managed +
 * Ended. Dropping the override then bounces the row back to the Ended section until the live pid lands
 * (the visible ended → working → ended → idle flicker). Holding it until state leaves Ended keeps the row
 * Working across that gap. A resume that dies never reaches a non-Ended Managed row; the pty-exit path
 * clears its override instead. Returns the same Set reference when nothing settled, so React can skip the
 * state update.
 */
export function pruneResuming(
  resuming: Set<string>,
  sessions: Session[],
): Set<string> {
  if (resuming.size === 0) return resuming;
  const next = new Set(resuming);
  for (const s of sessions)
    if (s.management === "managed" && s.state !== "ended") next.delete(s.id);
  return next.size === resuming.size ? resuming : next;
}

/**
 * Drop a single resume override by id — a resume that died (its pty exited) or was refused reverts to its
 * real (Ended/Observed) row instead of lying Managed. The same immutable-edit idiom as pruneResuming and
 * renameResuming, single-sourced here so the same-reference-when-unchanged contract (lets React skip the
 * update) can't drift across the call sites that clear an override. Returns the same Set reference when
 * `id` wasn't resuming.
 */
export function dropResuming(resuming: Set<string>, id: string): Set<string> {
  if (!resuming.has(id)) return resuming;
  const next = new Set(resuming);
  next.delete(id);
  return next;
}

/**
 * Apply the optimistic Resume override. An id the user resumed this run, before the next sync relabels it,
 * is forced to Managed (and Ended → Working) so the workspace flips from the read-only Transcript to the
 * live terminal in the same beat. Unlike a draft, the row already exists, so this overrides in place. App
 * clears the id once discovery reports it Managed, or when its pty exits.
 */
export function applyResuming(
  sessions: Session[],
  resuming: Set<string>,
): Session[] {
  if (resuming.size === 0) return sessions;
  return sessions.map((s) =>
    resuming.has(s.id)
      ? {
          ...s,
          management: "managed",
          state: s.state === "ended" ? "working" : s.state,
        }
      : s,
  );
}

/**
 * Apply the optimistic End override. An id the user ended this run, before the next sync relabels it, is
 * forced to Ended so the header swaps the End button out for Resume and the workspace flips to the read-only
 * Transcript in the same beat. Management is left as-is: the row reads Managed + Ended briefly (exactly like
 * a just-exited Resume), which keeps Resume disabled until the next sync re-derives it Observed. App clears
 * the id once discovery reports it Ended (pruneEnding), or when a racing Resume revives it (dropEnding).
 * Returns the same array reference when nothing is ending.
 */
export function applyEnding(
  sessions: Session[],
  ending: Set<string>,
): Session[] {
  if (ending.size === 0) return sessions;
  return sessions.map((s) => (ending.has(s.id) ? { ...s, state: "ended" } : s));
}

/**
 * Which End overrides discovery has caught up on, so App can drop them. An override is done once the real row
 * reads Ended: the killed pty's exit dropped its managed-registry entry, so the next sync re-derives the row
 * Ended (and Observed). Holding the override until then bridges the window where the just-killed pid still
 * reads alive for a tick. Returns the same Set reference when nothing settled, so React can skip the update.
 */
export function pruneEnding(
  ending: Set<string>,
  sessions: Session[],
): Set<string> {
  if (ending.size === 0) return ending;
  const next = new Set(ending);
  for (const s of sessions) if (s.state === "ended") next.delete(s.id);
  return next.size === ending.size ? ending : next;
}

/**
 * Drop a single End override by id — used when a Resume revives an id that a racing End click left in the
 * set. The End button reads `live` off the optimistic resuming overlay, so it can be clicked during an
 * in-flight Resume, before the pty this run owns exists; that kill no-ops, and pruneEnding would never clear
 * the override (the revived row reads alive, never Ended). Dropping it on resume-success unpins the now-live
 * row. The same immutable-edit idiom as dropResuming, single-sourced so the same-reference-when-unchanged
 * contract (lets React skip the update) can't drift. Returns the same Set reference when `id` wasn't ending.
 */
export function dropEnding(ending: Set<string>, id: string): Set<string> {
  if (!ending.has(id)) return ending;
  const next = new Set(ending);
  next.delete(id);
  return next;
}
