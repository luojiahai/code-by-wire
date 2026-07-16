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
    cli: {
      title: "Claude Code CLI",
      recheck: "Recheck",
      stateChecking: "CHECKING",
      stateReady: "READY",
      stateFault: "FAULT",
      version: "Version",
      config: "Config",
      notDetected: "not detected",
      headlineReady: "Ready",
      headlineOutdated: "Update available",
      headlineLoggedOut: "Logged out",
      headlineUnknown: "Status unknown",
      headlineNotFound: "Not found",
      detailReady: "Up to date and ready.",
      detailFallback: "Action needed.",
      installNativeLabel: "Native installer",
      installNativeNote:
        "Installs to ~/.local/bin/claude — make sure ~/.local/bin is on your PATH.",
      loginBefore:
        "Start a session (the terminal prompts you to log in), or run",
      loginAfter: "in your shell.",
      verifyBefore: "Run",
      verifyAfter: "in a terminal to check it works.",
      installDocs: "Install docs",
      copyAction: "copy",
      unavailableReason:
        "Claude Code CLI isn't usable — see Sys status in the title bar.",
    },
    statusline: {
      title: "Statusline",
      stateCapturing: "CAPTURING",
      stateStale: "STALE",
      stateFault: "FAULT",
      stateOff: "OFF",
      stateChecking: "CHECKING",
      enable: "Enable",
      disable: "Disable",
      staleHeadline: "NO FRESH CAPTURES",
      faultHeadline: "CAPTURE FAULT",
      repair: "Repair",
      watchKindLive: "live",
      watchKindWorking: "working",
      staleBody: (count: number, kind: string) =>
        `${count} ${kind} ${count === 1 ? "session" : "sessions"}, none reporting — captures have stopped. Repair rewrites the wrapper.`,
      // English wording fixed by the design spec — do not reword; the zh.ts entry is a real
      // translation of it, not a rewrite.
      noteOn:
        "Live duty, clock and rate limits reach the panels through Claude Code's statusline. Your own statusline renders as usual.",
      noteOff:
        "Capture is off: the panels fall back to transcript data — no live duty, clock or rate limits. Your statusline runs untouched.",
      lastCapture: "Last capture",
      never: "never",
      sessions: "Sessions",
      noSessions: (kind: string) => `no ${kind} sessions`,
      sessionsReporting: (reporting: number, watched: number, kind: string) =>
        `${reporting} of ${watched} ${kind} reporting`,
      refresh: "Refresh",
      eventsOnly: "on events only",
      every: (seconds: number) => `every ${seconds}s`,
      edit: "Edit",
      refreshPlaceholder: "seconds (1–60), empty for events only",
      save: "Save",
    },
    statsDb: {
      title: "Stats database",
      stateChecking: "CHECKING",
      backfilling: (done: number, total: number) =>
        `BACKFILLING · ${done}/${total}`,
      mirrored: "MIRRORED",
      location: "Location",
      size: "Size",
      ingested: "Ingested",
      ingestedValue: (turns: string, sessions: string) =>
        `${turns} turns · ${sessions} sessions`,
      history: "History",
      since: (day: string) => `since ${day}`,
      // English wording fixed by the design spec (2026-07-10) — do not reword; the zh.ts entries
      // are real translations of them, not rewrites.
      dangerHeadline: "IRREVERSIBLE BEYOND RETENTION",
      dangerBody:
        "Rebuilds from transcripts on disk. History older than Claude Code's cleanup window is lost for good.",
      resetError: "Couldn't reset. Please try again.",
      reset: "Reset",
      confirmTitle: "Reset the stats database?",
      confirmBody:
        "Clears the computed stats and rebuilds them from the transcripts on disk. History older than Claude Code's transcript retention is lost for good.",
    },
    update: {
      title: "Software update",
      autoCheckLabel: "Check for updates on launch",
      autoCheckDesc: "Look for a new version each time the app starts",
      upToDate: "Up to date",
      check: "Check for updates",
      checking: "Checking for updates…",
      available: "Update available",
      onVersion: (version: string) => `On v${version}`,
      onVersionReleased: (version: string, date: string) =>
        `On v${version} · released ${date}`,
      releaseNotes: "Release notes",
      download: "Download",
      downloading: "Downloading update…",
      downloadProgress: (transferred: string, total: string, percent: number) =>
        `${transferred} of ${total} · ${percent}%`,
      ready: "Update ready",
      downloaded: "Downloaded · installs when you next quit",
      restartHint: "or restart now to apply it immediately",
      restartNow: "Restart now",
      checkError: "Couldn't check for updates",
      retryDetail: (message: string) =>
        `${message} · will retry on next launch`,
      retry: "Retry",
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
