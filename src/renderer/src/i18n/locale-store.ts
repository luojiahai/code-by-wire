import "../api.d.ts";

import { atom } from "nanostores";
import { DEFAULT_LOCALE, type Locale } from "@shared/locale";
import { TRANSLATIONS } from "./catalog";
import type { Translations } from "./en";

/** The app's display language. Defaults to English (matching the main-process settings
 *  store's own default) until the initial IPC read resolves. */
export const $locale = atom<Locale>(DEFAULT_LOCALE);

/** Set the display language: updates the reactive value immediately (every useI18n
 *  consumer re-renders in the new language on this tick) and persists in the background. */
export function setLocale(locale: Locale): void {
  $locale.set(locale);
  void window.api.setLocale(locale);
}

/** The active catalog for non-React call sites (stores, helpers, event handlers).
 *  Replaces hermes's runtime.ts/translateNow: the atom is reachable imperatively, so
 *  there is no separate runtime to keep in sync and lookups stay fully typed. Never
 *  capture the result at module scope — resolve per call so language switches apply. */
export function tNow(): Translations {
  return TRANSLATIONS[$locale.get()];
}

// Module-scope, not a React effect: hydration and the DOM side effect below must run
// exactly once per renderer lifetime. Guarded so this module stays importable from
// node-run tests (no window) and jsdom tests (no window.api) — mirrors appearance-store.ts.
if (typeof window !== "undefined" && window.api) {
  void window.api.getLocale().then((locale: Locale) => $locale.set(locale));
}

if (typeof document !== "undefined") {
  // The lang attribute wants a BCP 47 tag: our "zh" (Simplified) maps to "zh-CN".
  $locale.subscribe((locale) => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  });
}
