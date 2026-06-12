import type { SessionState } from "@shared/types";

export interface SessionStateSignals {
  /** Is the session's process still alive? */
  alive: boolean;
  /** The `sessions/*.json` status field. Claude Code writes `'busy'` while generating and
   *  `'waiting'` while blocked on the user; both are authoritative. */
  status: string | undefined;
  /** Transcript-tail fallback: the last turn left a question or permission prompt unanswered.
   *  Catches a blocked session whose status field hasn't (yet) flipped to `'waiting'`. */
  awaitingUser: boolean;
}

/**
 * Session state from liveness and the status field, with the Transcript tail as a fallback.
 * Precedence (top wins): a gone process is Ended no matter what; a live one that's generating
 * is Working; a live one the status field calls `'waiting'` (or whose transcript tail shows an
 * unanswered prompt) is Waiting; otherwise Idle. The opt-in Notification hook later upgrades
 * Waiting to an exact signal.
 */
export function deriveSessionState({
  alive,
  status,
  awaitingUser,
}: SessionStateSignals): SessionState {
  if (!alive) return "ended";
  if (status === "busy") return "working";
  if (status === "waiting" || awaitingUser) return "waiting";
  return "idle";
}
