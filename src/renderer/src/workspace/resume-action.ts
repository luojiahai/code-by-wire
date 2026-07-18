import { useEffect, useRef, useState } from "react";
import type { Session } from "@shared/types";
import { tNow } from "../i18n";

/**
 * Whether Resume (resume under this session's own id) is available *right now*. Both resume surfaces show
 * the Resume button on every Ended session but gate its *enabled* state on this: you can't take the wheel
 * of a process that's still running, and a just-exited Managed session reads Managed until the next sync
 * re-derives it Observed — so Resume sits disabled across that brief window rather than vanishing. Single-
 * sourced here so the two surfaces can't drift (two hand-rolled copies did once already).
 */
export function canResumeSession(s: Session): boolean {
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

/**
 * The core Resume/Fork gate, single-sourced so the menu (`use-session-menu.ts`) and the Ended/Observed
 * terminal hero (`ResumeButton`) can't drift the way they did once already (2026-07-17 fork-gate-parity
 * fix: the menu grew an extra ended/observed check `ResumeButton` never had). Deliberately excludes
 * `busy` — that lives on the action object, not the session, so each caller ORs its own `action.busy` in.
 * `available` defaults to `true` (Fork's case, which never gates on anything beyond canSpawn/resumable);
 * Resume passes `canResumeSession(session)` here.
 */
export function resumeActionDisabled(opts: {
  canSpawn: boolean;
  resumable: boolean;
  available?: boolean;
  /** The agent's capability flag (canResume/canFork). Defaults true so claude-only surfaces
   *  don't have to pass it; the menu passes AGENTS[agent].capabilities.* */
  capable?: boolean;
}): boolean {
  const { canSpawn, resumable, available = true, capable = true } = opts;
  return !capable || !canSpawn || !resumable || !available;
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
 * The state machine shared by the Resume and Fork buttons (header + the Ended terminal hero): a busy flag,
 * an inline error, and a "no recorded model" confirm gate. `run` performs the action; `modelUnknown`
 * routes the first click through a warning modal (a modelless session can 400 on resume/fork); `armed`
 * clears the transient state when the button goes away (Resume re-arms when an Observed session ends
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
      setError(e instanceof Error ? e.message : tNow().workspace.resume.failed);
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
