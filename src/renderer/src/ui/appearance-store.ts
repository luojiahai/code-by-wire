import "../api.d.ts";

import { atom } from "nanostores";

export type AppearanceMode = "dark" | "light";

/** The app chrome's theme (panels, sidebar, settings, markdown code blocks). Independent of
 *  $terminalTheme below — see the 2026-07-14 light-theme design doc. Defaults to "dark" (matching
 *  the main-process settings store's own default) until the initial IPC read resolves. */
export const $appTheme = atom<AppearanceMode>("dark");

/** The terminal panels' theme (the interactive shell rail + the observed Claude-session terminal),
 *  independent of $appTheme — a user can run e.g. a light app with a dark terminal. */
export const $terminalTheme = atom<AppearanceMode>("dark");

/** Set the app theme: updates the reactive value immediately (every subscriber repaints/re-themes
 *  on this tick) and persists it in the background. */
export function setAppTheme(mode: AppearanceMode): void {
  $appTheme.set(mode);
  void window.api.setAppTheme(mode);
}

/** Set the terminal theme — same shape as setAppTheme, independent setting. */
export function setTerminalTheme(mode: AppearanceMode): void {
  $terminalTheme.set(mode);
  void window.api.setTerminalTheme(mode);
}

// Module-scope, not a React effect: both the initial hydration and the DOM side effect below must
// run exactly once per renderer lifetime, regardless of how many components subscribe. Guarded so
// this module stays importable from node-run tests (no window) and jsdom tests (no window.api,
// since no preload ran there) — mirrors shell-terminal/store.ts's storedBoolean/persistBoolean guards.
if (typeof window !== "undefined" && window.api) {
  void window.api
    .getAppTheme()
    .then((mode: AppearanceMode) => $appTheme.set(mode));
  void window.api
    .getTerminalTheme()
    .then((mode: AppearanceMode) => $terminalTheme.set(mode));
}

if (typeof document !== "undefined") {
  $appTheme.subscribe((mode) => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  });
  // Terminal theme is JS-only otherwise — use-terminal-session.ts/xterm-factory.ts subscribe
  // $terminalTheme to re-theme their own Terminal instances, but nothing mirrors it into the DOM, so
  // CSS has no way to tell the two themes apart. A handful of CSS surfaces need to follow Terminal
  // theme instead of App theme (the terminal pane's own chrome + the observed-session terminal's
  // container — see index.css's --terminal-editor-surface-background/--terminal-well-background),
  // so mirror $appTheme's own data-theme pattern with a second, independent attribute. No
  // colorScheme write here — that's a document-wide (native form controls/scrollbars) concern that
  // belongs to App theme alone.
  $terminalTheme.subscribe((mode) => {
    document.documentElement.dataset.terminalTheme = mode;
  });
}
