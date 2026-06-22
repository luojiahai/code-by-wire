import { useEffect, useRef, useState } from "react";
import type { Session } from "@shared/types";

/**
 * Whether Adopt (resume under this session's own id) is available *right now*. Both resume surfaces show
 * the Adopt button on every Ended session but gate its *enabled* state on this: you can't take the wheel of
 * a process that's still running, and a just-exited Managed session reads Managed until the next sync
 * re-derives it Observed — so Adopt sits disabled across that brief window rather than vanishing. Single-
 * sourced here so the two surfaces can't drift (two hand-rolled copies did once already).
 */
export function canAdoptSession(s: Session): boolean {
  return s.management === "observed" && s.state === "ended";
}

/**
 * A session that never recorded a real model (only '<synthetic>' turns — usually one that errored at
 * startup) has no valid model to resume, so `claude --resume`/`--fork-session` will 400. Both surfaces
 * route the first click through a warning modal when this is true.
 */
export function isModelUnknown(s: Session): boolean {
  return s.modelId == null && s.modelRaw == null;
}

export interface ResumeAction {
  busy: boolean;
  error: string | null;
  confirmOpen: boolean;
  /** Click handler: opens the no-model confirm when needed, else runs straight away. */
  request: () => void;
  /** Run after the confirm is accepted. */
  confirmYes: () => void;
  /** Dismiss the confirm without running. */
  confirmNo: () => void;
}

/**
 * The state machine shared by the Adopt and Fork buttons (header + the Ended terminal hero): a busy flag,
 * an inline error, and a "no recorded model" confirm gate. `run` performs the action; `modelUnknown`
 * routes the first click through a warning modal (a modelless session can 400 on resume/fork); `armed`
 * clears the transient state when the button goes away (Adopt re-arms when an Observed session ends
 * again — without this a stale error or wedged busy flag would flash on the re-shown button).
 */
export function useResumeAction(opts: {
  run: () => Promise<void>;
  modelUnknown: boolean;
  armed: boolean;
}): ResumeAction {
  const { run, modelUnknown, armed } = opts;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Synchronous re-entrancy guard. `busy` only disables the button after a re-render, so a fast
  // double-click (or a double-tap on the confirm) would fire run() twice before the disable lands. For
  // Fork that means two divergent forks: each mints its own id, so the manager's id-keyed idempotency
  // can't dedupe them. The ref blocks the second call in the same tick, before any state has settled.
  const running = useRef(false);

  useEffect(() => {
    if (!armed) {
      setBusy(false);
      setError(null);
      setConfirmOpen(false);
    }
  }, [armed]);

  async function go(): Promise<void> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resume");
    } finally {
      // Clear busy so an in-place failure (button still shown) leaves it usable, not stuck on "…".
      setBusy(false);
      running.current = false;
    }
  }

  return {
    busy,
    error,
    confirmOpen,
    request: () => {
      if (modelUnknown) setConfirmOpen(true);
      else void go();
    },
    confirmYes: () => {
      setConfirmOpen(false);
      void go();
    },
    confirmNo: () => setConfirmOpen(false),
  };
}
