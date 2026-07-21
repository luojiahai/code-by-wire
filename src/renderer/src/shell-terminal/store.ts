import { atom, computed } from "nanostores";

const TAKEOVER_KEY = "cbw.terminalTakeover";

// Window-guarded storage: this module is imported by node-run tests, where localStorage is absent.
function storedBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

function persistBoolean(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage failures are nonfatal (same policy as panes.ts).
  }
}

/** Whether the terminal pane is shown. Separate from the pane's own open-state (which stays true —
 *  the Pane is gated via `disabled`), so persisted resize overrides survive toggling. Hermes'
 *  $terminalTakeover, persisted the same way. */
export const $terminalTakeover = atom(storedBoolean(TAKEOVER_KEY, false));
$terminalTakeover.subscribe((active) => persistBoolean(TAKEOVER_KEY, active));

export const setTerminalTakeover = (active: boolean): void =>
  $terminalTakeover.set(active);

/** Whether the current route permits the terminal at all — false on every non-session route
 *  (Stats, Settings, New session, the empty state), set by an App.tsx effect. Not persisted: it's
 *  a property of where the user is, not of what they want.
 *
 *  Routing suppresses via THIS atom and never writes $terminalTakeover: clearing the preference
 *  would persist the off state, so a visit to Settings would silently cost the user their open
 *  terminal on the way back. */
export const $terminalAllowed = atom(true);

export const setTerminalAllowed = (allowed: boolean): void =>
  $terminalAllowed.set(allowed);

/** The terminal's effective visibility: the user's preference, suppressed off-route. Every
 *  consumer reads this rather than $terminalTakeover — only the toggles themselves touch the
 *  preference. */
export const $terminalVisible = computed(
  [$terminalTakeover, $terminalAllowed],
  (active, allowed) => active && allowed,
);

/** The selected session's cwd, fed by an App.tsx effect — the cbw analog of hermes' $currentCwd.
 *  createTerminal snapshots it once at creation; undefined/empty means main resolves home. */
export const $activeSessionCwd = atom<string | undefined>(undefined);
