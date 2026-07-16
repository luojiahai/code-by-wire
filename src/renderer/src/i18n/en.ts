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
  shell: {
    sidebar: {
      newSession: "New session",
      stats: "Stats",
      updatePendingTitle: "Update pending — see Settings › About",
      updatePendingSrOnly: "(update pending)",
      searchPlaceholder: "Search sessions…",
      searchLabel: "Search sessions",
      clearSearch: "Clear search",
      sessionsLabel: "Sessions",
      expandAll: "Expand all",
      collapseAll: "Collapse all",
      showAllSessions: "Show all sessions",
      showActiveOnly: "Show active sessions only",
      noActiveSessions: "No active sessions.",
      noSessionsYet: "No sessions yet.",
      newSessionIn: (cwd: string) => `New session in ${cwd}`,
    },
    sessionRow: {
      openSession: (title: string) => `Open ${title}`,
      sessionActions: "Session actions",
    },
    sessionMenu: {
      renameFieldLabel: "Rename session",
      menuTitle: "Session menu",
      copySessionId: "Copy session ID",
      rename: "Rename",
      adopt: "Adopt",
      adopting: "Adopting…",
      fork: "Fork",
      forking: "Forking…",
      endSession: "End session",
      openIn: "Open in",
      resumeConfirmTitle: "Resume a session with no recorded model?",
      resumeConfirmBody:
        "This session never recorded a model — it likely errored before its first turn — so resuming it may fail with a model error. Continue anyway?",
      resumeConfirmLabel: "Resume anyway",
      forkConfirmTitle: "Fork a session with no recorded model?",
      forkConfirmBody:
        "This session never recorded a model — it likely errored before its first turn — so forking it may fail with a model error. Continue anyway?",
      forkConfirmLabel: "Fork anyway",
      endConfirmTitle: "End this session?",
      endConfirmBody:
        "A turn is in progress and will be interrupted. The conversation is saved and can be resumed later with Adopt.",
      adoptTitleNoConversation:
        "Nothing to adopt — this session has no saved conversation.",
      adoptTitlePending:
        "This session just exited. Adopt is available in a moment.",
      forkTitleNoConversation:
        "Nothing to fork — this session has no saved conversation.",
      forkTitleEnded:
        "This session has ended — there's nothing live left to fork.",
      forkTitleObserved:
        "Fork isn't offered for an observed session — it isn't a session this app owns.",
      endTitleLive: "End this session",
      endTitleUnavailable:
        "End is only available for a live session you manage.",
    },
    newSession: {
      ledeBefore: "Spawns",
      ledeAfter: "in the chosen directory and drives it from a live terminal.",
      sessionSetup: "Session setup",
      directory: "Directory",
      choose: "Choose…",
      noDirectoryChosen: "No directory chosen",
      model: "Model",
      modelDefault: "Default",
      failedToStart: "Failed to start the session",
      create: "Create",
      starting: "Starting…",
    },
    middleHeader: {
      viewGroupLabel: "View",
      claudeCode: "Claude Code",
      transcript: "Transcript",
    },
    footer: {
      keepAwake: "Keep computer awake",
      letSleep: "Let computer sleep",
      caffeinate: "Caffeinate",
      showTerminal: "Show terminal",
      hideTerminal: "Hide terminal",
      terminal: "Terminal",
    },
    titlebar: {
      showSidebar: "Show sidebar",
      hideSidebar: "Hide sidebar",
      showRightPanel: "Show right panel",
      hideRightPanel: "Hide right panel",
    },
    gitReadout: {
      uncommittedChanges: "Uncommitted changes",
    },
    sessionPanel: {
      heading: "Session",
      model: "Model",
      effort: "Effort",
      git: "Git",
      pr: "PR",
      lines: "Lines",
      clock: "Clock",
      compactions: "Compactions",
      active: "Active",
      tokensReclaimed: (tokens: string) => `${tokens} tokens reclaimed`,
    },
    sessionList: {
      ungrouped: "(no project)",
    },
  },
  workspace: {
    emptyStates: {
      noSessions: "No Claude Code sessions found.",
      selectSession: "Select a session to open it.",
    },
  },
  stats: {
    clearDayFilter: "Clear the day filter",
    buildingHistory: "Building history…",
    noUsage: "No usage yet.",
    shared: {
      unknownModel: "Unknown",
      tokensHeader: "Tokens",
      showMore: (n: number, total: number) => `Show ${n} more (${total} total)`,
      rangeToday: "Today",
      range7d: "7d",
      range30d: "30d",
      range90d: "90d",
      rangeAll: "All",
    },
    overview: {
      sessions: "Sessions",
      tokens: "Tokens",
      favoriteModel: "Favorite model",
      activeDays: "Active days",
      mostActiveDay: "Most active day",
      longestSession: "Longest session",
      longestStreak: "Longest streak",
      currentStreak: "Current streak",
      streakUnit: (n: number): string => (n === 1 ? "day" : "days"),
      contributions: "Contributions",
      less: "Less",
      more: "More",
      trailingYear: "Last 12 months",
      tokensLabel: (value: string) => `${value} tokens`,
      dayTokensAria: (day: string, tokens: string) => `${day}: ${tokens}`,
    },
    models: {
      title: "Tokens per day",
      tooltipNoUsage: "No usage",
      total: "Total",
      inOut: (input: string, output: string) => `In: ${input} · Out: ${output}`,
    },
    projects: {
      title: "By project",
      nameLabel: "Project",
    },
    sessions: {
      title: "By session",
      colSession: "Session",
      colModel: "Model",
      colLastActivity: "Last activity",
      colDuration: "Duration",
      colTurns: "Turns",
      copySessionId: "Copy session ID",
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
