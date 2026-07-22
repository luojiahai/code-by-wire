import { useCallback, useEffect, useRef, useState } from "react";
import { shouldAutoCheck, type UpdateState } from "@shared/update";
import type { UpdateControls } from "../settings/SoftwareUpdateCard";

const INITIAL: UpdateState = {
  currentVersion: "",
  phase: { kind: "unsupported" },
};

/** Reads the initial update state + auto-check preference, subscribes to update-state pushes, and
 *  exposes the actions. One instance lives in App and is shared by the header badge and the About card. */
export function useUpdate(): UpdateControls {
  const [state, setState] = useState<UpdateState>(INITIAL);
  // Unknown until IPC resolves: treating it as enabled could override a persisted opt-out if the
  // user reaches About during initial paint.
  const [autoCheck, setAutoCheck] = useState<boolean | null>(null);
  const stateRef = useRef(state);
  const autoCheckRef = useRef(autoCheck);
  const lastCheckAtRef = useRef<number | null>(null);
  const previousPhaseRef = useRef(state.phase.kind);
  stateRef.current = state;
  autoCheckRef.current = autoCheck;

  useEffect(() => {
    let pushReceived = false;
    const unsub = window.api.onUpdateState((s) => {
      pushReceived = true;
      setState(s);
    });
    void window.api.getUpdateState().then((s) => {
      if (!pushReceived) setState(s);
    });
    void window.api.getAutoCheckUpdates().then(setAutoCheck);
    return unsub;
  }, []);

  // The launch check starts in main, outside the renderer action below. Completed states carry their
  // timestamp, so hydration after the transition still folds that check into the About-open throttle.
  useEffect(() => {
    if (state.phase.kind === "upToDate" || state.phase.kind === "available") {
      lastCheckAtRef.current = Math.max(
        lastCheckAtRef.current ?? -Infinity,
        state.phase.checkedAt,
      );
    } else if (
      previousPhaseRef.current === "checking" &&
      state.phase.kind !== "checking"
    ) {
      lastCheckAtRef.current = Date.now();
    }
    previousPhaseRef.current = state.phase.kind;
  }, [state.phase]);

  const check = useCallback((): void => {
    void window.api
      .checkForUpdate()
      .then(setState)
      .finally(() => {
        lastCheckAtRef.current = Date.now();
      });
  }, []);

  const maybeAutoCheck = useCallback((): void => {
    const enabled = autoCheckRef.current;
    if (enabled === null) return;
    const now = Date.now();
    if (
      !shouldAutoCheck(stateRef.current, enabled, lastCheckAtRef.current, now)
    )
      return;

    // Reserve the window before IPC so remounts/effect replays cannot enqueue another request.
    lastCheckAtRef.current = now;
    check();
  }, [check]);

  return {
    state,
    autoCheck: autoCheck ?? true,
    autoCheckReady: autoCheck !== null,
    check,
    maybeAutoCheck,
    download: () => void window.api.downloadUpdate(),
    install: () => window.api.installUpdate(),
    setAutoCheck: (enabled) => {
      setAutoCheck(enabled);
      void window.api.setAutoCheckUpdates(enabled);
    },
  };
}
