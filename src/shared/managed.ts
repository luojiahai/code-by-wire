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
 * Migrate an Adopt override across a `/clear` rotation (the live pty moved from `from` to `to`). If the
 * rotated id was adopting — its optimistic Managed/Working overlay still pending the next sync — move the
 * override onto the new id: the live pty under `to` keeps the overlay until discovery confirms it Managed,
 * while `from` (about to derive as an Ended ghost) drops it. Without this, the abandoned id keeps being
 * forced Managed/Working and lingers as a phantom session, no longer adoptable, for the rest of the run.
 * No-op (same reference) when `from` wasn't adopting.
 */
export function renameAdopting(
  adopting: Set<string>,
  from: string,
  to: string,
): Set<string> {
  if (!adopting.has(from)) return adopting;
  const next = new Set(adopting);
  next.delete(from);
  next.add(to);
  return next;
}

/**
 * Which adopt overrides discovery has caught up on, so App can drop them. An override is done only once
 * the real row reads BOTH Managed AND no longer Ended. Management flips to Managed the instant the app's
 * pty spawns (the in-memory managed registry), but the session's on-disk live pid lags until
 * `claude --resume` boots and writes its registry file — so a just-adopted row briefly reads Managed +
 * Ended. Dropping the override then bounces the row back to the Ended section until the live pid lands
 * (the visible ended → working → ended → idle flicker). Holding it until state leaves Ended keeps the row
 * Working across that gap. A resume that dies never reaches a non-Ended Managed row; the pty-exit path
 * clears its override instead. Returns the same Set reference when nothing settled, so React can skip the
 * state update.
 */
export function pruneAdopting(
  adopting: Set<string>,
  sessions: Session[],
): Set<string> {
  if (adopting.size === 0) return adopting;
  const next = new Set(adopting);
  for (const s of sessions)
    if (s.management === "managed" && s.state !== "ended") next.delete(s.id);
  return next.size === adopting.size ? adopting : next;
}

/**
 * Drop a single adopt override by id — a resume that died (its pty exited) or was refused reverts to its
 * real (Ended/Observed) row instead of lying Managed. The same immutable-edit idiom as pruneAdopting and
 * renameAdopting, single-sourced here so the same-reference-when-unchanged contract (lets React skip the
 * update) can't drift across the call sites that clear an override. Returns the same Set reference when
 * `id` wasn't adopting.
 */
export function dropAdopting(adopting: Set<string>, id: string): Set<string> {
  if (!adopting.has(id)) return adopting;
  const next = new Set(adopting);
  next.delete(id);
  return next;
}

/**
 * Apply the optimistic Adopt override. An id the user adopted this run, before the next sync relabels it,
 * is forced to Managed (and Ended → Working) so the workspace flips from the read-only Transcript to the
 * live terminal in the same beat. Unlike a draft, the row already exists, so this overrides in place. App
 * clears the id once discovery reports it Managed, or when its pty exits.
 */
export function applyAdopting(
  sessions: Session[],
  adopting: Set<string>,
): Session[] {
  if (adopting.size === 0) return sessions;
  return sessions.map((s) =>
    adopting.has(s.id)
      ? {
          ...s,
          management: "managed",
          state: s.state === "ended" ? "working" : s.state,
        }
      : s,
  );
}
