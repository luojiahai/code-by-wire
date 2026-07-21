import { ipcMain, shell, clipboard, nativeTheme } from "electron";
import { homedir } from "node:os";
import { statSync } from "node:fs";
import {
  IPC,
  type OverviewData,
  type StatsRead,
  type OpenInTarget,
  type UpdateState,
  type DbInfo,
} from "@shared/ipc";
import { normalizeLocale, type Locale } from "@shared/locale";
import type { Session } from "@shared/types";
import type { Provider } from "./provider/types";
import type { SqliteDb } from "./db/driver";
import type { StatusLineReader } from "@shared/statusline";
import type { ModelDefaults } from "@shared/models";
import type { CliStatus, CliStatusByAgent } from "@shared/cli-status";
import { AGENT_IDS, agentOrDefault, type AgentId } from "@shared/agents";
import type { CliStatusController } from "./cli-check";
import type { Updater } from "./updater";
import type { AppSettingsStore } from "./app-settings";
import type { Caffeinate } from "./caffeinate";
import type { UsageService } from "./usage/fetch";
import {
  deriveAccount,
  overlaySessions,
  freshestBySession,
  CAPTURE_STALE_MS,
} from "@shared/statusline";
import { deriveStatuslineStatus } from "@shared/statusline-status";
import type { StatuslineStatus } from "@shared/statusline-status";
import type { SettingsManager } from "./settings/manager";
import { readDefaultEffort } from "./settings/default-effort";
import { applyTitleOverrides } from "@shared/title-override";
import { applyPinOverrides } from "@shared/pin-override";
import type { SessionTitleStore } from "./session-titles";
import type { SessionPinStore } from "./session-pins";
import type { ProjectStateStore } from "./project-state";
import type { LaunchPresetStore } from "./launch-presets";
import { emptyLaunchPresets, type LaunchPresets } from "@shared/extra-args";
import { getOverview, readIndexDbCounts, readSessionTitles } from "./db/store";
import {
  readTotals,
  readBreakdowns,
  readDaily,
  readCalendar,
  readCalendarYears,
  readRecords,
  turnsMaxRowid,
  emptyTotals,
  hasAnyTurns,
  clearAnalytics,
  readWorktrees,
  upsertWorktree,
  readAnalyticsDbCounts,
} from "./db/analytics";
import { createWorktreeMap } from "./git/worktrees";
import {
  scanStep,
  collectScanTargets,
  freshTargets,
  type ScanTarget,
  type WalkCache,
} from "./analytics/scan";
import { collectCodexScanTargets, scanCodexStep } from "./analytics/codex-scan";
import type {
  StatsTotals,
  StatsRecords,
  StatsBreakdowns,
  ScanProgress,
  StatsRange,
  DailyBucket,
  CalendarDay,
  CalendarWindow,
  StatsWindow,
} from "@shared/stats";
import {
  emptySnapshot,
  emptyBreakdowns,
  emptyRecords,
  rangeWindow,
  calendarWindow,
  localDayKey,
  withSessionTitles,
} from "@shared/stats";
import { syncSessions } from "./sync";
import { isHttpUrl } from "./open-external";
import { openInTarget } from "./open-in";
import { isDirectory } from "./fs-dir";

export interface IpcDeps {
  db: SqliteDb;
  provider: Provider;
  /** Live statusLine captures. Defaults to "no captures" so the index still serves without them. */
  statusLine?: StatusLineReader;
  /** Reads the logged-in account email (cached by the caller). Defaults to no email. */
  accountEmail?: () => string | null;
  /** Reads the configured model defaults: per-family overrides, default family, allowed families
   *  (cached by the caller). Defaults to empty overrides. */
  modelDefaults?: () => ModelDefaults;
  /** Runs at the start of every sync, before discovery. Used to follow `/clear` rotations so the
   *  provider labels a rotated session correctly on the same tick. Its failure must not block the sync. */
  beforeSync?: () => void;
  /** The durable analytics store. When absent, stats:read serves zeros. Separate from `db` (the live
   *  index): a different file with its own lifecycle (#107). */
  analyticsDb?: SqliteDb;
  /** The Claude config dir, so stats:read can run a full transcript scan before aggregating. */
  claudeDir?: string;
  /** The Codex config dir containing sessions/YYYY/MM/DD rollout files. */
  codexDir?: string;
  /** Where the analytics store lives on disk (userData/analytics.db), for the Settings card's
   *  location/size readout. Optional like analyticsDb — dev harnesses may wire neither. */
  analyticsDbPath?: string;
  /** Where the rebuildable live-session index lives (userData/index.db). */
  indexDbPath?: string;
  /** The cached CLI-status controller. Defaults to a no-op that always returns null. */
  cliStatus?: CliStatusController;
  /** Durable user-chosen title overrides, applied over the live overlay so a rename wins over the
   *  derived title and Claude's live session_name. Defaults to no overrides. */
  sessionTitles?: SessionTitleStore;
  /** Durable pinned-session marks, stamped onto overview rows as pinnedAtMs. Defaults to no pins. */
  sessionPins?: SessionPinStore;
  /** Durable launch-args presets for the New-session picker. Defaults to no presets. */
  launchPresets?: LaunchPresetStore;
  /** Durable project-group placements, keyed by the sidebar's canonical project key. */
  projectState?: ProjectStateStore;
  /** The update controller. Defaults to an inert "unsupported" updater when not wired. */
  updater?: Updater;
  /** The app's own settings store (auto-check preference). Defaults to a no-op. */
  appSettings?: AppSettingsStore;
  /** The statusLine wrapper's settings manager. When absent, the statusline handlers report a
   *  wiring fault (dev harnesses that don't wire it still get a well-formed status). */
  settingsManager?: SettingsManager;
  /** Installer failure text from the launch attempt, surfaced as the initial fault. */
  statuslineLaunchFault?: string | null;
  /** The keep-awake toggle. Defaults to an inert off, so harnesses that don't wire it still get
   *  well-formed responses. */
  caffeinate?: Caffeinate;
  /** The OAuth usage service — the account's rate-limit fill side. Optional like accountEmail:
   *  when absent, the panel runs on capture windows alone. */
  usage?: UsageService;
  /** Per-agent session overlays applied in overviewNow after the claude statusline overlay —
   *  the generic seam a provider uses to attach non-persisted fields (codex telemetry today). */
  sessionOverlays?: Array<(sessions: Session[]) => Session[]>;
}

export function attachCliStatus<T extends object>(
  base: T,
  get: (agent: AgentId) => CliStatus | null,
): T & { cliStatus: CliStatusByAgent } {
  return {
    ...base,
    cliStatus: Object.fromEntries(AGENT_IDS.map((a) => [a, get(a)])),
  };
}

export function registerIpc({
  db,
  provider,
  statusLine,
  accountEmail,
  modelDefaults,
  beforeSync,
  analyticsDb,
  claudeDir,
  codexDir,
  analyticsDbPath,
  indexDbPath,
  cliStatus,
  sessionTitles,
  sessionPins,
  launchPresets,
  projectState,
  updater,
  appSettings,
  settingsManager,
  statuslineLaunchFault,
  caffeinate,
  usage,
  sessionOverlays,
}: IpcDeps): { sync: () => void } {
  const reader: StatusLineReader = statusLine ?? { read: () => [] };
  const readEmail = accountEmail ?? ((): string | null => null);
  const readDefaults =
    modelDefaults ?? ((): ModelDefaults => ({ overrides: {} }));
  const cli: CliStatusController = cliStatus ?? {
    get: () => null,
    recheck: () => {
      throw new Error("CLI status not wired");
    },
  };
  const inertState: UpdateState = {
    currentVersion: "",
    phase: { kind: "unsupported" },
  };
  const upd: Updater = updater ?? {
    getState: () => inertState,
    check: () => Promise.resolve(inertState),
    download: () => Promise.resolve(),
    quitAndInstall: () => {},
  };
  const settings: AppSettingsStore = appSettings ?? {
    read: () => ({}),
    setAutoCheckUpdates: () => {},
    setStatuslineEnabled: () => {},
    setAppTheme: () => {},
    setTerminalTheme: () => {},
    setAppLocale: () => {},
  };
  const caff: Caffeinate = caffeinate ?? {
    isOn: () => false,
    set: () => false,
  };

  const sync = (): void => {
    try {
      beforeSync?.();
    } catch (err) {
      // A reconcile failure (e.g. ~/.claude briefly unreadable) must not cost the session list.
      console.error("rotation reconcile failed; continuing with sync", err);
    }
    syncSessions(db, provider);
  };

  // cwd → linked-worktree identity: live git detection cached per cwd, seeded from (and written
  // back to) the durable analytics store so a deleted worktree's sessions keep merging across
  // restarts. Without an analytics db the map still live-detects; it just forgets on restart.
  const worktreeMap = createWorktreeMap(
    analyticsDb
      ? {
          load: () => readWorktrees(analyticsDb),
          save: (row) => upsertWorktree(analyticsDb, row),
        }
      : { load: () => [], save: () => {} },
  );

  // A6 last tier: the user's global default effort. Read once per app run (edits apply on relaunch,
  // like readModelDefaults); applied only where no per-session source answered.
  const defaultEffort = claudeDir ? readDefaultEffort(claudeDir) : null;

  /** The index snapshot enriched with the live statusLine overlay: per-session cost/context/lines, plus
   *  the app-wide account. Both handlers go through here so the list and the account share one read. The
   *  freshest-per-session map feeds both the overlay and the account, so the captures are walked once. */
  const overviewNow = (): OverviewData => {
    const now = Date.now();
    const base = getOverview(db);
    const byId = freshestBySession(reader.read());
    // deriveAccount owns the whole billing decision: subscription (API response or rate_limits
    // evidence) vs api. usage.read() is sync and non-blocking; a stale read spawns the refresh
    // that the NEXT poll picks up — no timers in main.
    const account = deriveAccount(
      byId.values(),
      now,
      CAPTURE_STALE_MS,
      usage?.read() ?? null,
    );
    if (account?.billingMode === "subscription") {
      // Subscription identity: the oauthAccount email. Attached only here, only for a
      // subscription — beside gateway billing it would mislabel, so a non-subscription account never gets it.
      const email = readEmail();
      if (email) account.email = email;
    }
    // Apply user renames AFTER the statusLine overlay so a cbw rename wins over the derived title and
    // Claude's live session_name. Read fresh each call so a just-persisted rename shows immediately.
    const overlaid = overlaySessions(base.sessions, byId);
    // Per-agent overlays (codex telemetry today): after the claude overlay, before renames/pins.
    const agentOverlaid = (sessionOverlays ?? []).reduce(
      (acc, overlay) => overlay(acc),
      overlaid,
    );
    const named = applyTitleOverrides(
      agentOverlaid,
      sessionTitles?.read() ?? {},
    );
    const pinned = applyPinOverrides(named, sessionPins?.read() ?? {});
    // A6 last tier: fill the settings.json default only where no per-session source (capture or
    // transcript scan) answered. Claude-only — the default comes from claude's settings.json, so
    // it must never masquerade as another agent's effort.
    const withEffort = defaultEffort
      ? pinned.map((s) =>
          s.agent === "claude" && !s.effortLevel
            ? { ...s, effortLevel: defaultEffort }
            : s,
        )
      : pinned;
    // Worktree sessions merge into their main repo's sidebar folder; tag them here, after the
    // overlay and renames, so the lookup sees the best-known cwd.
    const withWorktrees = withEffort.map((s) => {
      const wt = s.cwd ? worktreeMap.lookup(s.cwd) : null;
      return wt ? { ...s, worktree: wt } : s;
    });
    return attachCliStatus(
      {
        sessions: withWorktrees,
        account,
        homeDir: homedir(),
        projectState: projectState?.read() ?? {},
      },
      (agent) => cli.get(agent),
    );
  };

  // The last statusline installer failure (launch or action). Cleared by a succeeding action; shown
  // in the card's fault band. Module state is safe: registerIpc runs once, actions are serialized
  // through ipcMain's handler queue.
  let statuslineFault: string | null = statuslineLaunchFault ?? null;

  /** The Statusline card's readout, assembled from the three sources main already has: the settings
   *  manager (installed?, wrapped interval), the capture reader (freshest mtime per session), and the
   *  session index (states for the watch population). Pure derivation lives in shared. */
  const statuslineNow = (): StatuslineStatus => {
    const wrapper = settingsManager?.status() ?? {
      installed: false,
      refreshInterval: null,
    };
    const captures = new Map<string, number>();
    for (const s of reader.read()) {
      const prev = captures.get(s.sessionId);
      if (prev === undefined || s.capturedMtimeMs > prev)
        captures.set(s.sessionId, s.capturedMtimeMs);
    }
    return deriveStatuslineStatus({
      enabled: settings.read().statuslineEnabled ?? true,
      installed: wrapper.installed,
      fault:
        statuslineFault ??
        (settingsManager ? null : "Statusline is not wired in this build."),
      refreshInterval: wrapper.refreshInterval,
      captures,
      // Claude-only: the statusline is a Claude subsystem (its wrapper only ever wraps a Claude
      // session's own statusLine command), so a live codex session must never count toward "how
      // many sessions should be reporting" — it never can.
      sessions: getOverview(db)
        .sessions.filter((s) => s.agent === "claude")
        .map((s) => ({
          id: s.id,
          state: s.state,
        })),
      now: Date.now(),
    });
  };

  ipcMain.handle(IPC.statuslineGetStatus, () => statuslineNow());
  ipcMain.handle(IPC.statuslineSetEnabled, (_e, enabled: boolean) => {
    try {
      if (!settingsManager)
        throw new Error("Statusline is not wired in this build.");
      if (enabled) {
        // Preference first so a failing install still reads enabled+fault (Repair retries).
        settings.setStatuslineEnabled(true);
        settingsManager.install();
      } else {
        // Uninstall first: the preference only persists once the restore succeeded, so the
        // toggle never claims off while the wrapper is still installed.
        settingsManager.uninstall();
        settings.setStatuslineEnabled(false);
      }
      statuslineFault = null;
    } catch (err) {
      statuslineFault = (err as Error).message;
    }
    return statuslineNow();
  });
  ipcMain.handle(
    IPC.statuslineSetRefreshInterval,
    (_e, seconds: number | null) => {
      try {
        settingsManager?.setRefreshInterval(seconds);
        statuslineFault = null;
      } catch (err) {
        statuslineFault = (err as Error).message;
      }
      return statuslineNow();
    },
  );
  ipcMain.handle(IPC.statuslineRepair, () => {
    try {
      if (!settingsManager)
        throw new Error("Statusline is not wired in this build.");
      settingsManager.install();
      statuslineFault = null;
    } catch (err) {
      statuslineFault = (err as Error).message;
    }
    return statuslineNow();
  });

  ipcMain.handle(IPC.overview, () => overviewNow());
  ipcMain.handle(IPC.refresh, () => {
    try {
      sync();
    } catch (err) {
      // A failed refresh (e.g. ~/.claude briefly unreadable) must not reject to the renderer or
      // drop the list. Serve the last-known rows and let the next Refresh retry, like launch does.
      console.error("refresh sync failed; serving last-known rows", err);
    }
    return overviewNow();
  });
  ipcMain.handle(IPC.renameSession, (_e, id: string, title: string | null) => {
    try {
      sessionTitles?.set(id, title);
    } catch (err) {
      // A failed write (e.g. userData unwritable) must not reject to the renderer, which fires this
      // fire-and-forget; log it and serve the unchanged overview so the next rename retries — the same
      // resilience the refresh handler gives a failed sync.
      console.error(
        "renameSession persist failed; serving unchanged rows",
        err,
      );
    }
    return overviewNow();
  });
  ipcMain.handle(IPC.setSessionPinned, (_e, id: string, pinned: boolean) => {
    try {
      sessionPins?.set(id, pinned);
    } catch (err) {
      // Same contract as renameSession: a failed write must not reject the renderer's
      // fire-and-forget toggle; log and serve the unchanged overview so the next attempt retries.
      console.error(
        "setSessionPinned persist failed; serving unchanged rows",
        err,
      );
    }
    return overviewNow();
  });
  ipcMain.handle(
    IPC.launchPresetsGet,
    (): LaunchPresets => launchPresets?.read() ?? emptyLaunchPresets(),
  );
  ipcMain.handle(IPC.launchPresetsSet, (_e, presets: LaunchPresets): void => {
    try {
      launchPresets?.write(presets);
    } catch (err) {
      // Same contract as setSessionPinned: a failed write must not reject the renderer's
      // save; log it and let the next save retry.
      console.error("launchPresets persist failed", err);
    }
  });
  ipcMain.handle(
    IPC.setProjectPlacement,
    (_e, key: string, placement: "pinned" | "hidden" | "ordinary") => {
      if (!key.trim()) {
        console.error("setProjectPlacement rejected empty project key");
        return overviewNow();
      }
      try {
        if (["pinned", "hidden", "ordinary"].includes(placement))
          projectState?.setPlacement(key, placement);
      } catch (err) {
        console.error(
          "setProjectPlacement persist failed; serving unchanged overview",
          err,
        );
      }
      return overviewNow();
    },
  );
  ipcMain.handle(IPC.modelDefaults, () => readDefaults());
  ipcMain.handle(IPC.recheckCli, (_e, agent?: string) =>
    cli.recheck(agentOrDefault(agent)),
  );
  ipcMain.handle(IPC.readTranscript, (_e, id: string, sinceMtimeMs?: number) =>
    provider.readTranscript(id, sinceMtimeMs),
  );
  ipcMain.handle(
    IPC.getToolResult,
    (_e, id: string, toolUseId: string, agentId?: string) =>
      provider.getToolResult(id, toolUseId, agentId),
  );
  ipcMain.handle(
    IPC.readSubagentTranscript,
    (_e, id: string, agentId: string, sinceMtimeMs?: number) =>
      provider.readSubagentTranscript(id, agentId, sinceMtimeMs),
  );
  ipcMain.handle(IPC.readTasks, (_e, id: string, sinceMtimeMs?: number) =>
    provider.readTasks(id, sinceMtimeMs),
  );
  ipcMain.handle(IPC.readShells, (_e, id: string, sinceMtimeMs?: number) =>
    provider.readShells(id, sinceMtimeMs),
  );
  ipcMain.handle(
    IPC.readShellOutput,
    (_e, id: string, shellId: string, sinceMtimeMs?: number) =>
      provider.readShellOutput(id, shellId, sinceMtimeMs),
  );
  ipcMain.handle(IPC.readMonitors, (_e, id: string, sinceMtimeMs?: number) =>
    provider.readMonitors(id, sinceMtimeMs),
  );
  ipcMain.handle(
    IPC.readMonitorOutput,
    (_e, id: string, monitorId: string, sinceMtimeMs?: number) =>
      provider.readMonitorOutput(id, monitorId, sinceMtimeMs),
  );
  ipcMain.handle(IPC.readMetrics, (_e, id: string, sinceMtimeMs?: number) =>
    provider.readMetrics(id, sinceMtimeMs),
  );
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (isHttpUrl(url)) void shell.openExternal(url);
  });
  ipcMain.handle(IPC.revealPath, (_e, path: unknown) => {
    if (
      typeof path === "string" &&
      (path === analyticsDbPath || path === indexDbPath)
    )
      shell.showItemInFolder(path);
  });
  ipcMain.handle(IPC.openIn, (_e, id: string, target: OpenInTarget) =>
    openInTarget(
      {
        resolveCwd: (sid) => provider.resolveSessionCwd(sid),
        statDir: isDirectory,
        shell,
      },
      id,
      target,
    ),
  );
  ipcMain.handle(IPC.clipboardWriteText, (_e, text: string) => {
    clipboard.writeText(text);
  });
  ipcMain.handle(IPC.clipboardReadText, (_e, type?: "selection") =>
    // Electron only supports the X11 selection clipboard on Linux; guard so a stray "selection"
    // read elsewhere falls back to the regular clipboard instead of throwing.
    clipboard.readText(
      type === "selection" && process.platform === "linux"
        ? "selection"
        : undefined,
    ),
  );
  ipcMain.handle(IPC.updateGetState, (): UpdateState => upd.getState());
  ipcMain.handle(IPC.updateCheck, (): Promise<UpdateState> => upd.check());
  ipcMain.handle(IPC.updateDownload, (): Promise<void> => upd.download());
  ipcMain.handle(IPC.updateInstall, (): void => upd.quitAndInstall());
  ipcMain.handle(
    IPC.updateGetAutoCheck,
    (): boolean => settings.read().autoCheckUpdates ?? true,
  );
  ipcMain.handle(IPC.updateSetAutoCheck, (_e, enabled: boolean): void =>
    settings.setAutoCheckUpdates(enabled),
  );
  ipcMain.handle(
    IPC.appearanceGetAppTheme,
    (): "dark" | "light" => settings.read().appTheme ?? "dark",
  );
  ipcMain.handle(
    IPC.appearanceSetAppTheme,
    (_e, theme: "dark" | "light"): void => {
      settings.setAppTheme(theme);
      nativeTheme.themeSource = theme;
    },
  );
  ipcMain.handle(
    IPC.appearanceGetTerminalTheme,
    (): "dark" | "light" => settings.read().terminalTheme ?? "dark",
  );
  ipcMain.handle(
    IPC.appearanceSetTerminalTheme,
    (_e, theme: "dark" | "light"): void => settings.setTerminalTheme(theme),
  );
  ipcMain.handle(
    IPC.appearanceGetLocale,
    (): Locale => normalizeLocale(settings.read().appLocale),
  );
  ipcMain.handle(IPC.appearanceSetLocale, (_e, locale: Locale): void =>
    settings.setAppLocale(locale),
  );
  ipcMain.handle(IPC.caffeinateGet, (): boolean => caff.isOn());
  ipcMain.handle(IPC.caffeinateSet, (_e, on: boolean): boolean => caff.set(on));

  // Slice 2 lifecycle: the Stats view polls this while open. Each call runs ONE bounded, incremental scan
  // step (the event loop breathes between calls, so pty output and IPC stay responsive) and returns the
  // totals plus scan progress. Never reject to the renderer: a scan or read failure serves the last-known
  // totals with a `done` progress, so the view stops the "building history" poll instead of spinning.
  const doneProgress = (): ScanProgress => ({
    filesTotal: 0,
    filesDone: 0,
    done: true,
  });
  const safeTotals = (
    adb: SqliteDb,
    win: StatsWindow,
    agent: AgentId,
  ): StatsTotals => {
    try {
      return readTotals(adb, win, agent);
    } catch (err) {
      console.error("stats read failed; serving zeros", err);
      return emptyTotals();
    }
  };
  const safeRecords = (
    adb: SqliteDb,
    win: StatsWindow,
    nowMs: number,
    agent: AgentId,
  ): StatsRecords => {
    try {
      return readRecords(adb, win, nowMs, agent);
    } catch (err) {
      console.error("stats records read failed; serving zeros", err);
      return emptyRecords();
    }
  };
  const safeHasAnyTurns = (adb: SqliteDb, agent: AgentId): boolean => {
    try {
      return hasAnyTurns(adb, agent);
    } catch (err) {
      console.error(
        "stats hasAnyTurns check failed; treating store as empty",
        err,
      );
      return false;
    }
  };
  // All three breakdowns from one finest-grain scan; on any read error serve empty breakdowns so a bad row
  // never sinks the whole snapshot (matching safeTotals' "serve zeros" posture).
  const safeBreakdowns = (
    adb: SqliteDb,
    win: StatsWindow,
    agent: AgentId,
  ): StatsBreakdowns => {
    try {
      return readBreakdowns(adb, win, agent);
    } catch (err) {
      console.error("stats breakdown read failed; serving none", err);
      return emptyBreakdowns();
    }
  };
  // The index's id→title map for the By-session table, failure-tolerant: a bad index read just means the
  // table falls back to project basenames (same "serve a safe default" posture as the other safe* reads).
  const safeSessionTitles = (): Record<string, string> => {
    try {
      return readSessionTitles(db);
    } catch (err) {
      console.error(
        "stats session-title read failed; using project names",
        err,
      );
      return {};
    }
  };
  // The live session_name from the freshest statusLine capture per session, so the By-session table shows the
  // same name the overview/header/rail show (overlaySessions) instead of lagging the index title until the
  // next sync. Failure-tolerant like the other safe* reads: a bad capture read just drops the live overlay.
  const safeLiveNames = (): Record<string, string> => {
    try {
      const out: Record<string, string> = {};
      for (const [id, s] of freshestBySession(reader.read()))
        if (s.sessionName) out[id] = s.sessionName;
      return out;
    } catch (err) {
      console.error("stats live-name read failed; using index titles", err);
      return {};
    }
  };
  // The daily time-series, range-scoped; on a read error serve an empty series so a bad row never sinks
  // the snapshot (matching safeTotals/safeBreakdowns' "serve a safe default" posture).
  const safeDaily = (
    adb: SqliteDb,
    win: StatsWindow,
    agent: AgentId,
  ): DailyBucket[] => {
    try {
      return readDaily(adb, win, agent);
    } catch (err) {
      console.error("stats daily read failed; serving none", err);
      return [];
    }
  };
  // The contributions calendar and its year list, scoped to the calendar's OWN window (#115) — independent
  // of the page range. On a read error serve an empty series/list so a bad row never sinks the snapshot
  // (same "serve a safe default" posture as safeDaily/safeBreakdowns). A CalendarWindow's sinceMs/untilMs are
  // always set, so it satisfies readCalendar's StatsWindow structurally — pass it straight through.
  const safeCalendar = (
    adb: SqliteDb,
    win: CalendarWindow,
    agent: AgentId,
  ): CalendarDay[] => {
    try {
      return readCalendar(adb, win, agent);
    } catch (err) {
      console.error("stats calendar read failed; serving none", err);
      return [];
    }
  };
  // readCalendarYears is a full-table strftime scan, but its result only changes when a turn lands in a
  // not-yet-seen year — all but never within a session. Memoize it against the max turns rowid (a cheap O(1)
  // insert signal) so the gentle poll reuses the cached list instead of rescanning the whole table each tick.
  const yearsCache: Partial<
    Record<AgentId, { rowid: number; years: number[] }>
  > = {};
  const safeCalendarYears = (adb: SqliteDb, agent: AgentId): number[] => {
    try {
      const rowid = turnsMaxRowid(adb);
      if (!yearsCache[agent] || yearsCache[agent]?.rowid !== rowid) {
        yearsCache[agent] = { rowid, years: readCalendarYears(adb, agent) };
      }
      return yearsCache[agent]?.years ?? [];
    } catch (err) {
      console.error("stats calendar years read failed; serving none", err);
      return [];
    }
  };
  // Cache the target walk briefly so a 40ms backfill burst doesn't re-walk projects/ ~25×/sec. The TTL sits
  // below WARM_POLL_MS (1500ms), so a warm poll always re-walks fresh and catches other sessions promptly;
  // only a rapid burst reuses the list. Lives here, not in scanStep, so scanStep stays a pure function.
  const WALK_TTL_MS = 500;
  const walkCaches: Record<AgentId, WalkCache | null> = {
    claude: null,
    codex: null,
  };
  // Returns the (briefly-cached) target walk plus whether this call did a real disk walk. `fresh` lets the
  // handler avoid settling `done` off a stale cache hit: a session that appeared during a backfill burst is
  // absent from a cached list, so the cached set would drain to done=true while real work remains.
  const scanTargets = (
    agent: AgentId,
    now: number,
  ): { targets: ScanTarget[]; fresh: boolean } => {
    const dir = agent === "claude" ? claudeDir : codexDir;
    if (!dir) return { targets: [], fresh: true };
    const cache = walkCaches[agent];
    const fresh = !cache || now - cache.atMs >= WALK_TTL_MS;
    walkCaches[agent] = freshTargets(cache, now, WALK_TTL_MS, () =>
      agent === "claude"
        ? collectScanTargets(dir)
        : collectCodexScanTargets(dir),
    );
    return { targets: walkCaches[agent]?.targets ?? [], fresh };
  };
  // One bounded scan step against the (briefly cached) target walk — the shared engine behind
  // stats:read and stats:pump. When a step settles `done` off a cached (possibly stale) walk, re-walk
  // fresh once and re-step, so a file created during a backfill burst is ingested before the caller
  // drops to its gentle cadence. Serves a done progress (wrote:false) when no store/dir is wired or
  // the step throws, so pollers idle instead of spinning on a persistent failure.
  const runScanStep = (
    agent: AgentId,
    now: number,
  ): ScanProgress & { wrote: boolean } => {
    const dir = agent === "claude" ? claudeDir : codexDir;
    if (!analyticsDb || !dir) return { ...doneProgress(), wrote: false };
    try {
      const walk = scanTargets(agent, now);
      let step =
        agent === "claude"
          ? scanStep(analyticsDb, dir, undefined, walk.targets)
          : scanCodexStep(analyticsDb, dir, undefined, walk.targets);
      if (step.done && !walk.fresh) {
        walkCaches[agent] = null;
        const targets = scanTargets(agent, now).targets;
        const restep =
          agent === "claude"
            ? scanStep(analyticsDb, dir, undefined, targets)
            : scanCodexStep(analyticsDb, dir, undefined, targets);
        step = { ...restep, wrote: step.wrote || restep.wrote };
      }
      return step;
    } catch (err) {
      console.error("stats scan step failed; serving done progress", err);
      return { ...doneProgress(), wrote: false };
    }
  };
  // The poll's change token: the post-scan max turns rowid (a new turn always lands as a new row —
  // transcripts are append-only), the local day (the other input that moves the windowed output), and the
  // scan progress. Progress is in the token because a step can advance files WITHOUT moving the rowid (it
  // recorded an unreadable/half-written file, or the final file after a partial), and that progress change
  // must still re-render. On a read error return "" so the poll reads `changed` and serves a safe (zeroed)
  // snapshot instead of sticking.
  const tokenFor = (
    adb: SqliteDb,
    agent: AgentId,
    now: number,
    progress: ScanProgress,
  ): string => {
    try {
      return `${agent}:${turnsMaxRowid(adb)}:${localDayKey(now)}:${progress.filesDone}/${progress.filesTotal}`;
    } catch (err) {
      console.error("stats token read failed; forcing a full snapshot", err);
      return "";
    }
  };
  ipcMain.handle(
    IPC.readStats,
    (
      _e,
      rawAgent?: unknown,
      range?: StatsRange,
      calendarYear?: number,
      since?: string,
    ): StatsRead => {
      const now = Date.now();
      const agent = agentOrDefault(rawAgent);
      // The page window scopes totals/breakdowns/daily; a missing range falls back to all-time (#110). The
      // calendar window is resolved separately (#115), independent of `range`.
      const win = rangeWindow(range ?? "all", now);
      const cal = calendarWindow(calendarYear ?? null, now);

      // No durable store wired in: a constant per-day token, so repeated polls read unchanged after the first.
      if (!analyticsDb) {
        const token = `empty:${agent}:${localDayKey(now)}`;
        return since === token
          ? { status: "unchanged", token }
          : { status: "changed", token, snapshot: emptySnapshot() };
      }

      // One bounded scan step (runScanStep absorbs a missing store/dir and scan errors into a done
      // progress, so this poll serves last-known totals instead of rejecting).
      const { wrote, ...progress } = runScanStep(agent, now);

      // Skip every aggregate only when the token matches AND the backfill is caught up AND this step wrote
      // nothing: an in-progress backfill must keep re-rendering (its progress moves), and an in-place turn
      // update keeps the rowid but still changes the totals, so `wrote` forces a fresh snapshot.
      const token = tokenFor(analyticsDb, agent, now, progress);
      if (since === token && token !== "" && progress.done && !wrote)
        return { status: "unchanged", token };

      const breakdowns = safeBreakdowns(analyticsDb, win, agent);
      return {
        status: "changed",
        token,
        snapshot: {
          totals: safeTotals(analyticsDb, win, agent),
          records: safeRecords(analyticsDb, win, now, agent),
          progress,
          hasAnyTurns: safeHasAnyTurns(analyticsDb, agent),
          daily: safeDaily(analyticsDb, win, agent),
          ...breakdowns,
          bySession: withSessionTitles(
            breakdowns.bySession,
            safeSessionTitles(),
            sessionTitles?.read() ?? {},
            safeLiveNames(),
          ),
          calendar: safeCalendar(analyticsDb, cal, agent),
          calendarStart: cal.startDay,
          calendarEnd: cal.endDay,
          calendarYears: safeCalendarYears(analyticsDb, agent),
        },
      };
    },
  );

  // The background pump (spec 2026-07-10): the renderer drives one bounded scan step per poll for the
  // app's lifetime, so transcripts keep landing in the durable mirror even when the Stats view never
  // opens — before Claude Code's cleanupPeriodDays deletes them from disk. Progress only: no
  // aggregates are built. Never rejects.
  ipcMain.handle(IPC.pumpStats, (): ScanProgress => {
    const now = Date.now();
    const steps = AGENT_IDS.map((agent) => runScanStep(agent, now));
    return {
      filesTotal: steps.reduce((sum, step) => sum + step.filesTotal, 0),
      filesDone: steps.reduce((sum, step) => sum + step.filesDone, 0),
      done: steps.every((step) => step.done),
    };
  });

  // The Stats "Reset" action: drop the durable store so the next poll rebuilds it from disk. Clearing
  // processed_files forces a full re-scan; clearing turns drops the change token to zero, so the renderer's
  // very next readStats returns a fresh, still-rebuilding snapshot on its own. Never rejects: a missing
  // store or a failed clear resolves ok:false so the renderer can surface it without a thrown rejection.
  ipcMain.handle(IPC.resetAnalytics, (): { ok: boolean } => {
    if (!analyticsDb) return { ok: false };
    try {
      clearAnalytics(analyticsDb);
      // clearAnalytics DELETEs every turn, so the rebuild reuses rowids from 1 — the max-rowid insert
      // signal yearsCache memoizes against is no longer monotonic across this clear. Drop the cache so a
      // single-step rebuild that lands back on the same max rowid recomputes the year list instead of
      // serving the pre-reset one.
      for (const agent of AGENT_IDS) delete yearsCache[agent];
      return { ok: true };
    } catch (err) {
      console.error("analytics reset failed", err);
      return { ok: false };
    }
  });

  // Settings → Databases: one shape for both stores — paths, on-disk sizes, and live row counts.
  // Never rejects: a missing store/path or a failed stat/read resolves null and the cards render
  // their unavailable state.
  ipcMain.handle(IPC.dbInfo, (): DbInfo | null => {
    if (!analyticsDb || !analyticsDbPath || !indexDbPath) return null;
    try {
      return {
        analytics: {
          path: analyticsDbPath,
          sizeBytes: statSync(analyticsDbPath).size,
          ...readAnalyticsDbCounts(analyticsDb),
        },
        index: {
          path: indexDbPath,
          sizeBytes: statSync(indexDbPath).size,
          ...readIndexDbCounts(db),
        },
      };
    } catch (err) {
      console.error("database info read failed; serving none", err);
      return null;
    }
  });

  return { sync };
}
