import type { SessionState } from "@shared/types";
import type { NotifyShowRequest } from "@shared/ipc";

/** The slice of Session the decision reads — narrow so tests build rows without the full type. */
export interface AwaitingCandidate {
  id: string;
  title: string;
  project: string;
  state: SessionState;
}

/** The one reason the transcript-tail derivation can currently signal. When the parser learns to
 *  distinguish prompt kinds (permission vs question), this becomes per-session. */
export const AWAITING_BODY = "Waiting for your input";

export interface DecideInput {
  /** Per-session awaiting flags from the LAST poll, or null before any poll has landed. Null is the
   *  no-baseline case: sessions already waiting at app start describe the past, not a transition,
   *  so the first poll only seeds the baseline and never notifies. */
  prev: ReadonlyMap<string, boolean> | null;
  /** This poll's sessions (the overlaid list the user sees, so optimistic Ended/adopting rows count). */
  sessions: readonly AwaitingCandidate[];
  /** The user's "Notify when a session needs input" setting. Off still advances the baseline, so
   *  re-enabling never fires a backlog of transitions that happened while it was off. */
  enabled: boolean;
  /** Whether the app window has OS focus (document.hasFocus() at poll time). */
  windowFocused: boolean;
  /** The currently open session id (null for the pinned Overview/Settings/New-session routes). */
  selectedId: string | null;
}

export interface DecideResult {
  /** The next baseline: this poll's awaiting flag per session id. Always derived from `sessions`
   *  alone — suppressed or disabled transitions still land as true, so they can never fire later
   *  (only a fresh false→true after re-arming can). */
  baseline: Map<string, boolean>;
  /** The notifications to fire this poll, in session order. */
  notify: NotifyShowRequest[];
}

/** A session "needs the user" exactly when its derived state is `waiting` — the transcript parser's
 *  awaitingUser (or the registry's own 'waiting' status) surfaces to the renderer as this state. */
function isAwaiting(s: AwaitingCandidate): boolean {
  return s.state === "waiting";
}

/**
 * The whole notification decision, pure and poll-shaped: compare the previous poll's awaiting flags
 * against this poll's and name the sessions that just transitioned into awaiting. Rules:
 *
 * - Only a false→true transition notifies. A session that stays waiting across polls already fired;
 *   it re-arms only by leaving waiting (answered, working, ended) first.
 * - A session with no baseline entry (first poll overall, or a session that just appeared) never
 *   notifies: with no prior observation there is no transition, only unknown history.
 * - Focused window + that session selected suppresses: the user is already looking at the prompt.
 *   Focused-but-elsewhere still notifies — an OS notification is how the other session waves.
 * - `enabled` off suppresses everything but the baseline still advances (see DecideInput.enabled).
 */
export function decideNotifications({
  prev,
  sessions,
  enabled,
  windowFocused,
  selectedId,
}: DecideInput): DecideResult {
  const baseline = new Map(sessions.map((s) => [s.id, isAwaiting(s)]));
  if (prev === null || !enabled) return { baseline, notify: [] };
  const notify = sessions
    .filter((s) => isAwaiting(s) && prev.get(s.id) === false)
    .filter((s) => !(windowFocused && s.id === selectedId))
    .map((s) => ({
      sessionId: s.id,
      // A session always carries a derived title, but an empty one would render a blank
      // notification header — the project (directory basename) is the honest fallback.
      title: s.title || s.project,
      body: AWAITING_BODY,
    }));
  return { baseline, notify };
}
