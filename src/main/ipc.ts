import { ipcMain, shell, clipboard } from "electron";
import { homedir } from "node:os";
import {
  IPC,
  type OverviewData,
  type StatsRead,
  type OpenInTarget,
  type UpdateState,
} from "@shared/ipc";
import type { Provider } from "./provider/types";
import type { SqliteDb } from "./db/driver";
import type { StatusLineReader } from "@shared/statusline";
import type { ModelDefaults } from "@shared/models";
import type { CliStatus } from "@shared/cli-status";
import type { CliStatusController } from "./cli-check";
import type { Updater } from "./updater";
import type { AppSettingsStore } from "./app-settings";
import {
  deriveAccount,
  overlaySessions,
  freshestBySession,
  CAPTURE_STALE_MS,
} from "@shared/statusline";
import { deriveStatuslineStatus } from "@shared/statusline-status";
import type { StatuslineStatus } from "@shared/statusline-status";
import type { SettingsManager } from "./settings/manager";
import { applyTitleOverrides } from "@shared/title-override";
import type { SessionTitleStore } from "./session-titles";
import { getOverview, readSessionTitles } from "./db/store";
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
} from "./db/analytics";
import { createWorktreeMap } from "./git/worktrees";
import {
  scanStep,
  collectScanTargets,
  freshTargets,
  type ScanTarget,
  type WalkCache,
} from "./analytics/scan";
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
  /** The cached CLI-status controller. Defaults to a no-op that always returns null. */
  cliStatus?: CliStatusController;
  /** Durable user-chosen title overrides, applied over the live overlay so a rename wins over the
   *  derived title and Claude's live session_name. Defaults to no overrides. */
  sessionTitles?: SessionTitleStore;
  /** The update controller. Defaults to an inert "unsupported" updater when not wired. */
  updater?: Updater;
  /** The app's own settings store (auto-check preference). Defaults to a no-op. */
  appSettings?: AppSettingsStore;
  /** The statusLine wrapper's settings manager. When absent, the statusline handlers report a
   *  wiring fault (dev harnesses that don't wire it still get a well-formed status). */
  settingsManager?: SettingsManager;
  /** Installer failure text from the launch attempt, surfaced as the initial fault. */
  statuslineLaunchFault?: string | null;
}

export function attachCliStatus<T extends object>(
  base: T,
  get: () => CliStatus | null,
): T & { cliStatus: CliStatus | null } {
  return { ...base, cliStatus: get() };
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
  cliStatus,
  sessionTitles,
  updater,
  appSettings,
  settingsManager,
  statuslineLaunchFault,
}: IpcDeps): { sync: () => void } {
  const reader: StatusLineReader = statusLine ?? { read: () => [] };
  const readEmail = accountEmail ?? ((): string | null => null);
  const readDefaults =
    modelDefaults ?? ((): ModelDefaults => ({ overrides: {} }));
  const cli = cliStatus ?? {
    get: () => null,
    recheck: () => {
      throw new Error("CLI status not wired");
    },
    setBinPath: () => {
      throw new Error("CLI status not wired");
    },
    resolvedPath: () => null,
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
    setClaudeBinPath: () => {},
    setAutoCheckUpdates: () => {},
    setStatuslineEnabled: () => {},
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

  /** The index snapshot enriched with the live statusLine overlay: per-session cost/context/lines, plus
   *  the app-wide account. Both handlers go through here so the list and the account share one read. The
   *  freshest-per-session map feeds both the overlay and the account, so the captures are walked once. */
  const overviewNow = (): OverviewData => {
    const now = Date.now();
    const base = getOverview(db);
    const byId = freshestBySession(reader.read());
    // deriveAccount owns the whole billing decision: subscription (rate_limits evidence) vs api (no evidence).
    const account = deriveAccount(byId.values(), now, CAPTURE_STALE_MS);
    if (account?.billingMode === "subscription") {
      // Subscription identity: the oauthAccount email. Attached only here, only for a
      // subscription — beside gateway billing it would mislabel, so a non-subscription account never gets it.
      const email = readEmail();
      if (email) account.email = email;
    }
    // Apply user renames AFTER the statusLine overlay so a cbw rename wins over the derived title and
    // Claude's live session_name. Read fresh each call so a just-persisted rename shows immediately.
    const overlaid = overlaySessions(base.sessions, byId);
    const named = applyTitleOverrides(overlaid, sessionTitles?.read() ?? {});
    // Worktree sessions merge into their main repo's sidebar folder; tag them here, after the
    // overlay and renames, so the lookup sees the best-known cwd.
    const withWorktrees = named.map((s) => {
      const wt = s.cwd ? worktreeMap.lookup(s.cwd) : null;
      return wt ? { ...s, worktree: wt } : s;
    });
    return attachCliStatus(
      { sessions: withWorktrees, account, homeDir: homedir() },
      () => cli.get(),
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
      sessions: getOverview(db).sessions.map((s) => ({
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
  ipcMain.handle(IPC.capabilities, () => provider.capabilities);
  ipcMain.handle(IPC.modelDefaults, () => readDefaults());
  ipcMain.handle(IPC.recheckCli, () => cli.recheck());
  ipcMain.handle(IPC.setClaudeBinPath, (_e, path: string | null) =>
    cli.setBinPath(path),
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
  ipcMain.handle(IPC.readMetrics, (_e, id: string, sinceMtimeMs?: number) =>
    provider.readMetrics(id, sinceMtimeMs),
  );
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (isHttpUrl(url)) void shell.openExternal(url);
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

  // Slice 2 lifecycle: the Stats view polls this while open. Each call runs ONE bounded, incremental scan
  // step (the event loop breathes between calls, so pty output and IPC stay responsive) and returns the
  // totals plus scan progress. Never reject to the renderer: a scan or read failure serves the last-known
  // totals with a `done` progress, so the view stops the "building history" poll instead of spinning.
  const doneProgress = (): ScanProgress => ({
    filesTotal: 0,
    filesDone: 0,
    done: true,
  });
  const safeTotals = (adb: SqliteDb, win: StatsWindow): StatsTotals => {
    try {
      return readTotals(adb, win);
    } catch (err) {
      console.error("stats read failed; serving zeros", err);
      return emptyTotals();
    }
  };
  const safeRecords = (
    adb: SqliteDb,
    win: StatsWindow,
    nowMs: number,
  ): StatsRecords => {
    try {
      return readRecords(adb, win, nowMs);
    } catch (err) {
      console.error("stats records read failed; serving zeros", err);
      return emptyRecords();
    }
  };
  const safeHasAnyTurns = (adb: SqliteDb): boolean => {
    try {
      return hasAnyTurns(adb);
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
  const safeBreakdowns = (adb: SqliteDb, win: StatsWindow): StatsBreakdowns => {
    try {
      return readBreakdowns(adb, win);
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
  const safeDaily = (adb: SqliteDb, win: StatsWindow): DailyBucket[] => {
    try {
      return readDaily(adb, win);
    } catch (err) {
      console.error("stats daily read failed; serving none", err);
      return [];
    }
  };
  // The contributions calendar and its year list, scoped to the calendar's OWN window (#115) — independent
  // of the page range. On a read error serve an empty series/list so a bad row never sinks the snapshot
  // (same "serve a safe default" posture as safeDaily/safeBreakdowns). A CalendarWindow's sinceMs/untilMs are
  // always set, so it satisfies readCalendar's StatsWindow structurally — pass it straight through.
  const safeCalendar = (adb: SqliteDb, win: CalendarWindow): CalendarDay[] => {
    try {
      return readCalendar(adb, win);
    } catch (err) {
      console.error("stats calendar read failed; serving none", err);
      return [];
    }
  };
  // readCalendarYears is a full-table strftime scan, but its result only changes when a turn lands in a
  // not-yet-seen year — all but never within a session. Memoize it against the max turns rowid (a cheap O(1)
  // insert signal) so the gentle poll reuses the cached list instead of rescanning the whole table each tick.
  let yearsCache: { rowid: number; years: number[] } | null = null;
  const safeCalendarYears = (adb: SqliteDb): number[] => {
    try {
      const rowid = turnsMaxRowid(adb);
      if (!yearsCache || yearsCache.rowid !== rowid) {
        yearsCache = { rowid, years: readCalendarYears(adb) };
      }
      return yearsCache.years;
    } catch (err) {
      console.error("stats calendar years read failed; serving none", err);
      return [];
    }
  };
  // Cache the target walk briefly so a 40ms backfill burst doesn't re-walk projects/ ~25×/sec. The TTL sits
  // below WARM_POLL_MS (1500ms), so a warm poll always re-walks fresh and catches other sessions promptly;
  // only a rapid burst reuses the list. Lives here, not in scanStep, so scanStep stays a pure function.
  const WALK_TTL_MS = 500;
  let walkCache: WalkCache | null = null;
  // Returns the (briefly-cached) target walk plus whether this call did a real disk walk. `fresh` lets the
  // handler avoid settling `done` off a stale cache hit: a session that appeared during a backfill burst is
  // absent from a cached list, so the cached set would drain to done=true while real work remains.
  const scanTargets = (
    now: number,
  ): { targets: ScanTarget[]; fresh: boolean } => {
    if (!claudeDir) return { targets: [], fresh: true };
    const fresh = !walkCache || now - walkCache.atMs >= WALK_TTL_MS;
    walkCache = freshTargets(walkCache, now, WALK_TTL_MS, () =>
      collectScanTargets(claudeDir),
    );
    return { targets: walkCache.targets, fresh };
  };
  // The poll's change token: the post-scan max turns rowid (a new turn always lands as a new row —
  // transcripts are append-only), the local day (the other input that moves the windowed output), and the
  // scan progress. Progress is in the token because a step can advance files WITHOUT moving the rowid (it
  // recorded an unreadable/half-written file, or the final file after a partial), and that progress change
  // must still re-render. On a read error return "" so the poll reads `changed` and serves a safe (zeroed)
  // snapshot instead of sticking.
  const tokenFor = (
    adb: SqliteDb,
    now: number,
    progress: ScanProgress,
  ): string => {
    try {
      return `${turnsMaxRowid(adb)}:${localDayKey(now)}:${progress.filesDone}/${progress.filesTotal}`;
    } catch (err) {
      console.error("stats token read failed; forcing a full snapshot", err);
      return "";
    }
  };
  ipcMain.handle(
    IPC.readStats,
    (
      _e,
      range?: StatsRange,
      calendarYear?: number,
      since?: string,
    ): StatsRead => {
      const now = Date.now();
      // The page window scopes totals/breakdowns/daily; a missing range falls back to all-time (#110). The
      // calendar window is resolved separately (#115), independent of `range`.
      const win = rangeWindow(range ?? "all", now);
      const cal = calendarWindow(calendarYear ?? null, now);

      // No durable store wired in: a constant per-day token, so repeated polls read unchanged after the first.
      if (!analyticsDb) {
        const token = `empty:${localDayKey(now)}`;
        return since === token
          ? { status: "unchanged", token }
          : { status: "changed", token, snapshot: emptySnapshot() };
      }

      // One bounded scan step when there's a dir to scan; otherwise serve last-known with a done progress.
      let progress = doneProgress();
      let wrote = false;
      if (claudeDir) {
        try {
          const walk = scanTargets(now);
          let step = scanStep(analyticsDb, claudeDir, undefined, walk.targets);
          // Don't settle `done` off a cached (possibly stale) walk: re-walk fresh once and re-step, so a
          // file created during a backfill burst is ingested before we drop to the warm cadence.
          if (step.done && !walk.fresh) {
            walkCache = null;
            const restep = scanStep(
              analyticsDb,
              claudeDir,
              undefined,
              scanTargets(now).targets,
            );
            step = { ...restep, wrote: step.wrote || restep.wrote };
          }
          ({ wrote, ...progress } = step);
        } catch (err) {
          console.error(
            "stats scan step failed; serving last-known totals",
            err,
          );
        }
      }

      // Skip every aggregate only when the token matches AND the backfill is caught up AND this step wrote
      // nothing: an in-progress backfill must keep re-rendering (its progress moves), and an in-place turn
      // update keeps the rowid but still changes the totals, so `wrote` forces a fresh snapshot.
      const token = tokenFor(analyticsDb, now, progress);
      if (since === token && token !== "" && progress.done && !wrote)
        return { status: "unchanged", token };

      const breakdowns = safeBreakdowns(analyticsDb, win);
      return {
        status: "changed",
        token,
        snapshot: {
          totals: safeTotals(analyticsDb, win),
          records: safeRecords(analyticsDb, win, now),
          progress,
          hasAnyTurns: safeHasAnyTurns(analyticsDb),
          daily: safeDaily(analyticsDb, win),
          ...breakdowns,
          bySession: withSessionTitles(
            breakdowns.bySession,
            safeSessionTitles(),
            sessionTitles?.read() ?? {},
            safeLiveNames(),
          ),
          calendar: safeCalendar(analyticsDb, cal),
          calendarStart: cal.startDay,
          calendarEnd: cal.endDay,
          calendarYears: safeCalendarYears(analyticsDb),
        },
      };
    },
  );

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
      yearsCache = null;
      return { ok: true };
    } catch (err) {
      console.error("analytics reset failed", err);
      return { ok: false };
    }
  });

  return { sync };
}
