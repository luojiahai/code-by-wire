import {
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatMonthShort,
  formatRelativeTime,
  formatResetCountdown,
  formatTokensAxis,
  formatTokensShort,
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
    continue: "Continue",
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
      pinnedLabel: "Pinned",
      noPinnedSessions: "No pinned sessions.",
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
      // Pinned-row worktree hint: the real checked-out branch, shown only when it differs from
      // the worktree directory name (they're independent fields and can diverge).
      branchTooltip: (branch: string) => `Branch: ${branch}`,
      // The Lamp glyph's hover-tooltip state word (session-glyph.ts's glyphTitle lowercases it).
      state: {
        working: "Working",
        waiting: "Waiting",
        idle: "Idle",
        ended: "Ended",
      },
    },
    sessionMenu: {
      renameFieldLabel: "Rename session",
      menuTitle: "Session menu",
      pin: "Pin",
      unpin: "Unpin",
      copySessionId: "Copy ID",
      rename: "Rename",
      resume: "Resume",
      resuming: "Resuming…",
      fork: "Fork",
      forking: "Forking…",
      endSession: "End",
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
        "A turn is in progress and will be interrupted. The conversation is saved and can be resumed later.",
      resumeTitleNoConversation:
        "Nothing to resume — this session has no saved conversation.",
      resumeTitlePending:
        "This session just exited. Resume is available in a moment.",
      forkTitleNoConversation:
        "Nothing to fork — this session has no saved conversation.",
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
      // The PR review/merge status word next to the #number link. Source is gh's own stable enums
      // (state: OPEN|CLOSED|MERGED, reviewDecision: APPROVED|CHANGES_REQUESTED|REVIEW_REQUIRED) or
      // the statusLine capture's reviewState (currently pending/approved/changes_requested, "or
      // anything newer" per its own doc comment — not a fully closed set). En just normalizes case
      // and underscores; zh translates the known words and falls back to this same normalized
      // string for anything it doesn't recognize, so a future gh/capture value never breaks.
      prStatus: (raw: string) => raw.toLowerCase().replace(/_/g, " "),
    },
    sessionList: {
      ungrouped: "(no project)",
    },
  },
  /** Chrome for both terminal surfaces: the interactive shell-terminal pane's tab rail
   *  (rail.tsx) and its context menu, AND the renderer-synthesized banners each terminal writes
   *  directly into its own xterm viewport (the Managed pty's exit notice in terminal-store.ts;
   *  the interactive shell's spawn-failure notice in use-terminal-session.ts). Terminal CONTENT
   *  (pty/shell output) is the shell's own — never translated; only chrome the app itself writes
   *  is. `defaultTitle` is the tab's placeholder label until the pty reports the resolved shell
   *  name or the user renames it. `processExited`/`spawnFailed` are substituted into hand-built
   *  ANSI escape sequences at the call site — keep them as bare word phrases (or, for
   *  `spawnFailed`, a function around the interpolated error message); never fold the escape
   *  codes themselves into the catalog. */
  terminal: {
    tabListAria: "Terminals",
    newTerminal: "New terminal",
    closeOthers: "Close others",
    closeAll: "Close all",
    defaultTitle: "Terminal",
    processExited: "process exited",
    spawnFailed: (message: string) => `Terminal failed to start: ${message}`,
  },
  workspace: {
    emptyStates: {
      noSessions: "No Claude Code sessions found.",
      selectSession: "Select a session to open it.",
    },
    // The Managed/Observed legend (currently unwired to any live popover — see mode-info.ts's
    // docstring — but kept translated since the table itself still ships).
    mode: {
      managed: {
        label: "Managed",
        blurb:
          "Spawned and driven by Code-by-wire. You can send input, interrupt it, and end it from here.",
      },
      observed: {
        label: "Observed",
        blurb:
          "Running in another terminal or machine. Code-by-wire mirrors its transcript read-only. You can't type in. Resume it to take the wheel.",
      },
    },
    observedTerminal: {
      endedBadge: "Ended",
      observedBadge: "Observed",
      endedBody: "This session has ended. Bring it back to life.",
      observedBody:
        "This session is running in another terminal — read-only here.",
      endedFooter: "Resume = take the wheel · Fork = explore a new branch",
      observedFooter: "Fork it to branch off into your own session.",
    },
    resume: {
      // useResumeAction's generic fallback when the thrown error carries no message of its own.
      failed: "Failed to resume",
      // App.tsx's resumeSession/forkSession throw Error(...) with these exact messages, surfaced
      // verbatim as e.message by useResumeAction's catch — must stay translated, not just the
      // generic `failed` fallback above (which only fires for a non-Error throw).
      aliveAgain: "This session is alive again.",
      couldNotResume: "Could not resume this session.",
      couldNotFork: "Could not fork this session.",
    },
    openIn: {
      finder: "Finder",
      fileExplorer: "File Explorer",
      fileManager: "File Manager",
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
  /** The Activity dock (Tasks/Subagents/Shells/Monitors tabs) plus the right-rail telemetry panels
   *  (Pressure/Spend/Duty/Throughput) that share its `chrome.tsx` PanelSection/PanelHeading shell. */
  dock: {
    label: "Activity",
    resizeAria: "Resize activity dock",
    collapseAria: "Collapse activity dock",
    collapseTitle: "Collapse",
    expandAria: "Expand activity dock",
    expandTitle: "Expand",
    tabs: {
      tasks: "Tasks",
      subagents: "Subagents",
      shells: "Shells",
      monitors: "Monitors",
    },
    tally: (
      tasks: number,
      subagents: number,
      shells: number,
      monitors: number,
    ) =>
      `${tasks} tasks · ${subagents} subagents · ${shells} shells · ${monitors} monitors`,
    // One shared status-word group for every dock tab's glyph label / status pill / metric tag, so
    // Tasks (blocked), Shells and Monitors (running/completed/failed/killed/stopped) all read from
    // here instead of each tab minting its own copy of the same words.
    status: {
      running: "running",
      completed: "completed",
      failed: "failed",
      killed: "killed",
      stopped: "stopped",
      blocked: "blocked",
    },
    aboutMetric: (title?: string) =>
      title ? `About ${title}` : "About this metric",
    tokensUnit: "tokens",
    tasks: {
      empty: "No tasks yet.",
    },
    subagents: {
      empty: "No subagents yet.",
      drillAria: (type: string) => `Drill into ${type} subagent`,
      toolUse: "tool use",
      toolUses: "tool uses",
      toolUsesAria: (n: number) => `${n} tool ${n === 1 ? "use" : "uses"}`,
    },
    shells: {
      empty: "No background shells.",
      openLogAria: (command: string) => `Open log for ${command}`,
      // Appended to a completed shell's status word on a non-zero exit, e.g. "failed (exit 1)".
      exitSuffix: (code: number) => ` (exit ${code})`,
      truncated: (kb: number) => `${kb} KB of earlier output hidden`,
    },
    monitors: {
      empty: "No monitors.",
      openDetailsAria: (command: string) => `Open details for ${command}`,
    },
    pressure: {
      heading: "Pressure",
      info: "How much headroom is left: the current prompt's context fill over the window, then this session's rate-limit windows (% used, time to reset — the session's own numbers, filled from the account API where the session hasn't reported). Extra is the account's paid extra-usage credit. Bars warm to amber past 70% and redline past 85%.",
      noContext: "No context sampled yet.",
      contextWindowUnit: "% context window",
      extra: "Extra",
      // Fixed-width technical shorthand (a 28px/w-7 label column) — kept identical across locales so
      // the rate-limit rows don't overflow their gutter; S/O are the Sonnet/Opus initials.
      windowFiveHour: "5h",
      windowSevenDay: "7d",
      windowSevenDaySonnet: "7d S",
      windowSevenDayOpus: "7d O",
    },
    spend: {
      heading: "Spend",
      info: "What this session has consumed: total tokens by kind — fresh input, generated output, cached reads, and the 5-minute and 1-hour cache writes. The $ is Claude Code's own session accounting; on a subscription it is the API-equivalent value, not a bill.",
      // Mirrors ui/token-kinds.ts's TOKEN_KINDS, keyed the same way, so SpendPanel can render
      // translated label/description text while still iterating TOKEN_KINDS for order and key.
      kinds: {
        input: {
          label: "Input",
          description:
            "Fresh prompt tokens processed this session, at full price.",
        },
        output: {
          label: "Output",
          description: "Tokens the model generated.",
        },
        cacheRead: {
          label: "Cache read",
          description:
            "Context replayed from cache instead of reprocessed, ~10% of input price.",
        },
        cacheWrite5m: {
          label: "Cache write 5m",
          description:
            "Context written into the 5-minute cache so the next turn replays it cheaply. 1.25× input.",
        },
        cacheWrite1h: {
          label: "Cache write 1h",
          description:
            "Context written into the longer-lived 1-hour cache. 2× input.",
        },
      },
    },
    duty: {
      heading: "Duty",
      info: "The session's duty cycle: how much of its lifetime an API request was actually in flight — time the model was working versus the session sitting open. Cumulative since the session started, so a long-idle session reads low even while currently busy.",
      apiUnit: "% api",
    },
    throughput: {
      heading: "Throughput",
      info: "Token throughput over the last 60s of active generation. The sparkline traces total tokens/sec across recent samples; idle gaps between turns don't count.",
      idle: "idle",
      input: "Input",
      output: "Output",
      // Mirrors SPEED_WINDOW_MS in src/main/provider/claude/transcript-speed.ts (60s) — keep in
      // sync if that window changes. The long form crowded the heading at 237px.
      windowLabel: "60s",
    },
  },
  /** The transcript feed: message bubbles, tool/edit rows, subagent dispatches, and the subagent
   *  drill-in breadcrumb. Transcript CONTENT itself (message text, tool input/output, code) is Claude
   *  Code's own — never translated here; only the chrome around it (labels, empty states, aria text). */
  transcript: {
    noneObserved: "No transcript on disk for this session yet.",
    noneManaged: "No transcript yet — drive the session in the Terminal tab.",
    noneSubagent: "No transcript on disk for this subagent yet.",
    waitingHeading: "Waiting for you",
    // Shown only when the CLI's own waitingReason is unset — the reason text itself (when present)
    // is Claude Code's own content and is never translated.
    waitingFallback: "Waiting for your input",
    you: "You",
    claude: "Claude",
    thinking: "Thinking",
    toolRunning: "running…",
    toolNoOutput: "no output",
    toolOutputLines: (n: number) => `${n} line${n === 1 ? "" : "s"}`,
    viewToolOutput: (name: string) => `View ${name} output`,
    viewDiff: (tool: string, file: string) => `View ${tool} diff for ${file}`,
    subagentLabel: "Subagent",
    session: "Session",
    subagentCrumb: (type: string, description?: string) =>
      description ? `Subagent (${type}): ${description}` : `Subagent (${type})`,
  },
  /** The tool-result/diff/shell/monitor detail modals (ToolResultModal, DiffModal, ShellDetailModal,
   *  MonitorDetailModal) plus the OutputBox they share. Close/Copy reuse `common.close`/`common.copy`
   *  rather than minting per-modal duplicates. */
  modals: {
    escToClose: "Esc to close",
    shellTitle: "Shell details",
    monitorTitle: "Monitor details",
    detail: {
      status: "Status",
      runtime: "Runtime",
      command: "Command",
      script: "Script",
      output: "Output",
    },
    // Mirrors turn-status.ts's status union (ok/error/pending) shared by the tool and diff rows.
    turnStatus: {
      ok: "passed",
      error: "failed",
      pending: "running",
    },
    toolResult: {
      loading: "Loading output…",
      loadError: "Couldn't load output.",
      runningNoOutput: "Running — no output yet.",
      copyOutput: "Copy output",
    },
    diff: {
      noChanges: "no changes",
      copyPath: "Copy path",
      copyDiff: "Copy diff",
    },
    outputBox: {
      reading: "Reading output…",
      unavailable: "No output available",
    },
  },
  /** Wordy time/rate formatting (relative times, durations, month dates). English
   *  delegates to the deterministic @shared/format helpers; zh re-implements the
   *  same thresholds with Chinese units (hermes-style per-locale function values).
   *  Digit-grouped and currency formatters (formatTokens, formatUsd, formatBytes) are
   *  NOT here — they stay in @shared/format, locale-independent by design. The
   *  k/M-abbreviated token counts ARE here (see `numbers` below): Chinese groups large
   *  numbers by powers of 10^4 (万/亿), not 10^3 (k/M), so the abbreviation itself —
   *  not just a unit label — differs by locale. */
  time: {
    ago: (ms: number, now: number) => formatRelativeTime(ms, now),
    countdown: (resetsAt: number, now: number) =>
      formatResetCountdown(resetsAt, now),
    duration: (ms: number) => formatDuration(ms),
    tps: (tps: number) => formatTps(tps),
    // Split form of tps(), for callers that style the number and the unit separately (e.g. a hero
    // number with a small unit label beside it) — avoids string-splitting the combined tps() output
    // with a locale-specific regex. tpsValue + " " + tpsUnit reproduces tps()'s own output.
    tpsValue: (tps: number) => {
      if (!Number.isFinite(tps) || tps <= 0) return "0";
      if (tps >= 1000) return (tps / 1000).toFixed(1) + "k";
      return tps.toFixed(1);
    },
    tpsUnit: "tokens/s",
    dayShort: (day: string) => formatDayShort(day),
    dayLong: (day: string) => formatDayLong(day),
    monthShort: (day: string) => formatMonthShort(day),
  },
  // Large-number abbreviation. English groups by powers of 10^3 (k/M) via the shared
  // formatTokensShort/formatTokensAxis helpers; zh groups by powers of 10^4 (万/亿) with
  // its own thresholds — a genuinely different scheme, not just a different unit string.
  numbers: {
    tokensShort: (n: number) => formatTokensShort(n),
    tokensAxis: (n: number) => formatTokensAxis(n),
  },
};

export type Translations = typeof en;
