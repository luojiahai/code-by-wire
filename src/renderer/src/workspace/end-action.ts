import { useEffect, useState } from "react";

export interface EndAction {
  confirmOpen: boolean;
  /** Click handler: opens the mid-turn confirm when needed, else ends straight away. */
  request: () => void;
  /** Run after the confirm is accepted. */
  confirmYes: () => void;
  /** Dismiss the confirm without ending. */
  confirmNo: () => void;
}

/**
 * The End-session button's tiny state machine: a mid-turn confirm gate. `run` performs the end (a
 * fire-and-forget kill); `midTurn` routes the first click through a confirm because a turn is in flight and
 * would be cut. No busy flag or re-entrancy guard: kill is idempotent on a dead/missing pty (unlike Fork,
 * which mints a new id and needs the guard), and the optimistic overlay flips the button away on the next
 * render.
 *
 * `armed` clears a stale open confirm when the gate is no longer valid — the session ended (the button is
 * gone) or its turn finished (the "a turn is in progress" warning no longer holds). Without it confirmOpen
 * outlives the condition that opened it: a background sync flipping the row to idle leaves the dialog lying,
 * and worse, a sync ending the row then a same-id Resume (Workspace is keyed by id, so it doesn't remount)
 * would re-show a confirm the user never asked for, whose accept kills the freshly-resumed session. Same
 * shape as useResumeAction's `armed` reset.
 */
export function useEndAction(opts: {
  run: () => void;
  midTurn: boolean;
  armed: boolean;
}): EndAction {
  const { run, midTurn, armed } = opts;
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => {
    if (!armed) setConfirmOpen(false);
  }, [armed]);
  return {
    confirmOpen,
    request: () => {
      if (midTurn) setConfirmOpen(true);
      else run();
    },
    confirmYes: () => {
      setConfirmOpen(false);
      run();
    },
    confirmNo: () => setConfirmOpen(false),
  };
}
