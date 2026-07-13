import { useEffect, useRef } from "react";
import { useStore } from "@nanostores/react";
import type { Session } from "@shared/types";
import { decideNotifications } from "./decide";
import { $notifyOnAwaiting, initNotifyOnAwaiting } from "./store";

/**
 * The renderer half of session notifications, hung off App's poll: every new session list runs the
 * pure decision (notifications/decide.ts) against the previous poll's awaiting flags, fires one
 * `notify:show` per false→true transition, and advances the baseline. Living here — not in main —
 * keeps main request/response-only: the 3s poll that already exists is the only clock.
 *
 * Also owns the round trip back: a click on a notification makes main focus the window and push the
 * session id (notify:activate); the subscription below selects it.
 */
export function useAwaitingNotifications({
  sessions,
  selectedId,
  onActivate,
}: {
  /** The overlaid session list App renders (drafts/adopting/ending applied) — the user's view of
   *  each session's state is the one transitions are judged against. */
  sessions: readonly Session[];
  selectedId: string | null;
  /** Select the clicked notification's session (App's setSelectedId). */
  onActivate: (sessionId: string) => void;
}): void {
  const enabled = useStore($notifyOnAwaiting);
  // The previous poll's awaiting flags; null until the first list lands (the no-baseline case the
  // decision treats as "seed only, never notify"). A ref, not state: advancing it must not re-render.
  const baselineRef = useRef<Map<string, boolean> | null>(null);

  // Seed the preference atom from the persisted setting once per app run.
  useEffect(() => {
    void initNotifyOnAwaiting();
  }, []);

  // The detector. Keyed on the list identity: every poll applies a fresh array, so this runs once
  // per poll. Re-runs from the other deps (selection, toggle) are harmless no-ops — the baseline
  // already matches the current list, so no transition can be found.
  useEffect(() => {
    const { baseline, notify } = decideNotifications({
      prev: baselineRef.current,
      sessions,
      enabled,
      windowFocused: document.hasFocus(),
      selectedId,
    });
    baselineRef.current = baseline;
    for (const req of notify) void window.api.showNotification(req);
  }, [sessions, enabled, selectedId]);

  // Notification click → select that session. The push arrives only after main focused the window.
  useEffect(() => {
    return window.api.onNotifyActivate(onActivate);
  }, [onActivate]);
}
