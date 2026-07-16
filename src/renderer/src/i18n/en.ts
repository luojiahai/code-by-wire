import {
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatMonthShort,
  formatRelativeTime,
  formatResetCountdown,
  formatTps,
} from "@shared/format";

/**
 * The English catalog — both the default language and the shape contract:
 * `Translations` is derived from this object (a plain literal, NOT `as const`,
 * so strings infer as `string` and zh.ts can hold different text), and zh.ts is
 * typed `: Translations`, making any missing/extra key a compile error. Ported
 * from hermes desktop's i18n (typed nested catalogs, arrow functions for
 * interpolation) — see the 2026-07-16 i18n design doc.
 */
export const en = {
  common: {
    cancel: "Cancel",
    close: "Close",
    copy: "Copy",
    copied: "Copied",
  },
  settings: {
    nav: {
      settings: "Settings",
      system: "System",
      appearance: "Appearance",
      about: "About",
    },
    appearance: {
      title: "Appearance",
      lede: "Dark is the default for both the app and the terminal — light is opt-in.",
      language: "Language",
      languageDesc: "The app's display language",
      appTheme: "App theme",
      appThemeDesc: "The panels, sidebar, and settings",
      terminalTheme: "Terminal theme",
      terminalThemeDesc:
        "The interactive shell and the observed session terminal",
      dark: "Dark",
      light: "Light",
    },
    system: {
      title: "System",
      lede: "The machinery feeding this app. Keep it green.",
    },
    about: {
      title: "About",
      tagline:
        "Pilot every Claude Code session and monitor its telemetry, from one cockpit.",
    },
  },
  /** Wordy time/rate formatting (relative times, durations, month dates). English
   *  delegates to the deterministic @shared/format helpers; zh re-implements the
   *  same thresholds with Chinese units (hermes-style per-locale function values).
   *  Pure-numeric formatters (tokens, $, bytes) are NOT here — they stay in
   *  @shared/format, locale-independent by design. */
  time: {
    ago: (ms: number, now: number) => formatRelativeTime(ms, now),
    countdown: (resetsAt: number, now: number) =>
      formatResetCountdown(resetsAt, now),
    duration: (ms: number) => formatDuration(ms),
    tps: (tps: number) => formatTps(tps),
    dayShort: (day: string) => formatDayShort(day),
    dayLong: (day: string) => formatDayLong(day),
    monthShort: (day: string) => formatMonthShort(day),
  },
};

export type Translations = typeof en;
