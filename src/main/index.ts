import {
  app,
  BrowserWindow,
  nativeTheme,
  net,
  powerSaveBlocker,
} from "electron";
import { applyLegacyDockIconIfNeeded } from "./dock-icon";
import { join } from "node:path";
import { homedir } from "node:os";
import { openDb } from "./db/sqlite";
import type { SqliteDb } from "./db/driver";
import { migrate, getSessionAgent } from "./db/store";
import { migrateAnalytics } from "./db/analytics";
import { createClaudeProvider } from "./provider/claude";
import { createCodexProvider } from "./provider/codex";
import { createCodexLimitsService } from "./provider/codex/limits";
import { resolveCodexDir } from "./provider/codex/config";
import { listRollouts, readRolloutHead } from "./provider/codex/rollout";
import { applyClaims } from "./provider/codex/claim";
import { createCompositeProvider } from "./provider/composite";
import type { Provider } from "./provider/types";
import { AGENT_IDS, type AgentId } from "@shared/agents";
import { createManagedRegistry } from "./managed-registry";
import type { ManagedRegistry } from "./managed-registry";
import { applyRotations } from "./provider/claude/rotation";
import { readSessionFiles } from "./provider/claude/discover";
import { registerIpc } from "./ipc";
import { createSettingsManager } from "./settings/manager";
import { createStatusLineReader } from "./statusline/reader";
import { registerTerminalIpc } from "./terminal/ipc";
import { registerShellTerminalIpc } from "./terminal/shell-ipc";
import {
  buildShellEnv,
  isExecutableFile,
  findOnPath,
} from "./terminal/shell-command";
import { readAccountEmail } from "./settings/account-email";
import { readModelDefaults } from "./settings/model-defaults";
import { readSessionWindowMs } from "./settings/session-window";
import type { ModelDefaults } from "@shared/models";
import { resolveClaudeDir } from "./claude-config";
import { createAppSettingsStore } from "./app-settings";
import { createCaffeinate } from "./caffeinate";
import { createSessionTitleStore } from "./session-titles";
import { createSessionPinStore } from "./session-pins";
import { createCliStatusController } from "./cli-check";
import { createUpdater } from "./updater";
import { createUsageService } from "./usage/fetch";
import { createTokenReader } from "./usage/credentials";
import {
  probeShellEnv,
  resolveShellPath,
  shouldCorrectPath,
} from "./terminal/shell-path";
import { HEADER_HEIGHT_PX, MAC_TRAFFIC_LIGHT_POSITION } from "@shared/chrome";
import { IPC } from "@shared/ipc";

// Pin the whole app to the sRGB color profile. Without this, the packaged build inherits the
// display's profile (Display P3 on modern Macs) and Chromium stretches our sRGB-authored palette
// toward that wider gamut, oversaturating colors like the Claude Code mascot orange. Dev already
// renders sRGB, so this only changes the packaged build, making it match dev. Must run before the
// 'ready' event (before the GPU process starts), so it lives at module top level.
app.commandLine.appendSwitch("force-color-profile", "srgb");

/** The BrowserWindow's native background, painted before the page loads — must match the
 *  persisted app theme or the window flashes the wrong color on launch. Native window chrome, so
 *  it lives here rather than in index.css. */
const WINDOW_BACKGROUND: Record<"dark" | "light", string> = {
  dark: "#0e0e0e",
  light: "#ffffff",
};

function createWindow(
  managed: ManagedRegistry,
  resolveResumeTarget: (id: string) => { alive: boolean; cwd: string } | null,
  registerRename: (rename: (from: string, to: string) => void) => void,
  shellEnv: () => NodeJS.ProcessEnv,
  appTheme: "dark" | "light",
): void {
  // The renderer header is a fixed HEADER_HEIGHT_PX tall and doubles as the title bar. On macOS we hide
  // the native title bar but KEEP the traffic lights (titleBarStyle 'hidden', never frame:false — the
  // same choice VS Code makes), float them into the header, and offset native sheets (the directory
  // picker) below the header so they don't clip under it. Windows/Linux keep their default frame.
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: WINDOW_BACKGROUND[appTheme],
    ...(isMac
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION,
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });
  if (isMac) win.setSheetOffset(HEADER_HEIGHT_PX);

  // Let the renderer slide the wordmark into the corner when the traffic lights vacate it: push the
  // window's native fullscreen state on every change, and re-push on each load so a dev reload re-syncs
  // the fresh renderer. macOS-only — the lights are the only reason the header insets at all.
  if (isMac) {
    const sendFullscreen = (): void => {
      if (!win.isDestroyed())
        win.webContents.send(IPC.fullscreen, win.isFullScreen());
    };
    win.on("enter-full-screen", sendFullscreen);
    win.on("leave-full-screen", sendFullscreen);
    win.webContents.on("did-finish-load", sendFullscreen);
  }

  // Managed-terminal IPC is per-window: the manager pushes pty output to this window's renderer and
  // kills its ptys when the window closes. Its `rename` (the /clear follow) is handed to the sync
  // reconcile and revoked when the window closes.
  const { rename } = registerTerminalIpc({
    window: win,
    managed,
    resolveResumeTarget,
    posixShell: { isExecutable: isExecutableFile, findOnPath },
  });
  registerRename(rename);

  // The footer shell terminal: a second manager on its own channels. No registry, no resume/fork —
  // plain interactive shells that die with the window.
  registerShellTerminalIpc({ window: win, env: shellEnv });

  win.on("closed", () => registerRename(() => {}));

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app
  .whenReady()
  .then(() => {
    // Purely cosmetic (pre-Tahoe Dock icon shape); a failure here must never cost the user a window,
    // and this runs before openWindow() below so an unguarded throw would be worse than the guarded
    // calls further down that at least run after the window is up.
    try {
      applyLegacyDockIconIfNeeded(app);
    } catch (err) {
      console.error("could not apply the pre-Tahoe Dock icon", err);
    }
    const db = openDb(join(app.getPath("userData"), "index.db"));
    migrate(db); // bring the index schema up to date before the first sync
    // The durable, non-pruned analytics store (#107). A separate file with its own user_version, so a
    // live-index schema bump (which DROPs and rebuilds index.db) never touches all-time history. It's
    // optional by contract — when it can't be opened (corrupt file, locked, bad permissions) stats:read
    // serves zeros — so guard the open: a failure here must never cost the user a window (same principle
    // as the statusLine install below).
    const analyticsDbPath = join(app.getPath("userData"), "analytics.db");
    let analyticsDb: SqliteDb | undefined;
    try {
      analyticsDb = openDb(analyticsDbPath);
      migrateAnalytics(analyticsDb);
    } catch (err) {
      console.error("analytics store unavailable; stats will show zeros", err);
      analyticsDb = undefined;
    }
    // The registry of app-spawned ids, shared by reference: the terminal IPC writes it on spawn, the
    // provider reads it to label discovered sessions Managed.
    const managed = createManagedRegistry();
    // Created here (not down with the other settings reads, after the window) because createWindow
    // needs the persisted app theme for its initial backgroundColor/nativeTheme, and unlike
    // claudeDir/shellEnv this store has no slow probe to wait on — hoisting it costs nothing against
    // the "window opens before the slow login-shell probe" invariant below.
    const appSettings = createAppSettingsStore({
      dir: app.getPath("userData"),
    });
    // Pin the native macOS traffic-light buttons to the persisted app theme at launch; the
    // appearance:setAppTheme IPC handler (ipc.ts) keeps this in sync for later in-app changes.
    nativeTheme.themeSource = appSettings.read().appTheme ?? "dark";
    // The live window's terminal-rename hook, set when a window opens and revoked when it closes. The
    // reconcile (below) calls through it to follow a /clear, so it's a no-op before the first window.
    let renameInWindow: (from: string, to: string) => void = () => {};
    const registerRename = (
      rename: (from: string, to: string) => void,
    ): void => {
      renameInWindow = rename;
    };
    // Env for user shells in the footer terminal: process.env with the recovered PATH (packaged,
    // Finder-launched) run through buildShellEnv's scrub/declare. Does NOT pin CLAUDE_CONFIG_DIR — a
    // user's interactive shell keeps their own config (hermes parity). `correctedPath` is populated by
    // the startup probe below; this closure is only ever invoked after that probe has run.
    const shellTermEnv = (): NodeJS.ProcessEnv =>
      buildShellEnv({
        baseEnv: correctedPath
          ? { ...process.env, PATH: correctedPath }
          : process.env,
        appVersion: app.getVersion(),
      });
    // provider + cliStatus are wired below, AFTER the window. The window's closures only read them on a
    // later spawn/resume (never during createWindow), so a holder populated a few lines down is enough —
    // and it lets the window open before claudeDir, which needs the synchronous login-shell probe.
    const services: {
      provider?: Provider;
      cliStatus?: ReturnType<typeof createCliStatusController>;
    } = {};
    // Stand the window up FIRST, before the synchronous login-shell probe + claudeDir-dependent wiring
    // below. The probe (and the initial sync) run in this same synchronous turn, so the renderer's first
    // overview() invoke just queues until registerIpc runs a few lines down — but the window has already
    // painted, so a slow login shell no longer blanks the screen on launch. Mirrors the lazy
    // correctedPath/shellTermEnv closure above and the setTimeout'd CLI check below.
    const openWindow = (): void =>
      createWindow(
        managed,
        (id) => services.provider?.resolveResumeTarget(id) ?? null,
        registerRename,
        shellTermEnv,
        appSettings.read().appTheme ?? "dark",
      );
    openWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow();
    });
    // Push update-state to whatever window is open (resolved at send-time, like the fullscreen push).
    const sendUpdate = (state: import("@shared/update").UpdateState): void => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w && !w.isDestroyed()) w.webContents.send(IPC.updateState, state);
    };
    const updater = createUpdater({
      send: sendUpdate,
      isPackaged: app.isPackaged,
      currentVersion: app.getVersion(),
    });
    // One login-shell probe at startup: recover the real PATH and a rc-set CLAUDE_CONFIG_DIR that a
    // Finder-launched .app doesn't inherit. Packaged-only (dev inherits the shell env); tight timeout. Runs
    // AFTER createWindow (above) so it never blocks first paint, but BEFORE the settings/statusline/provider
    // readers so they ALL read the recovered dir — not ~/.claude — when CLAUDE_CONFIG_DIR is relocated,
    // keeping discovery and transcript/resume reads in sync.
    const shellEnv = app.isPackaged
      ? probeShellEnv(process.env.SHELL || "/bin/zsh")
      : null;
    // Packaged but the probe came back empty: a slow/wedged login shell timed out, or its rc printed
    // nothing usable. PATH and CLAUDE_CONFIG_DIR then fall back to the well-known dirs / ~/.claude, so a
    // `claude` installed somewhere exotic won't be found. Say so once rather than degrading silently.
    if (app.isPackaged && shellEnv === null) {
      console.warn(
        "could not recover the login-shell environment (slow shell startup or a wedged rc file); " +
          "falling back to well-known dirs for PATH. If sessions can't find `claude`, speed up your " +
          "shell startup or check its config.",
      );
    }
    const recoveredConfigDir = shellEnv?.configDir ?? null;
    // claudeDir feeds the settings/transcript readers below (settingsManager, statusLine, provider) —
    // where THIS APP reads Claude Code's own data from, independent of how sessions are spawned.
    const claudeDir = resolveClaudeDir(undefined, recoveredConfigDir);
    // correctedPath feeds only the footer terminal's env (shellTermEnv above); Managed sessions no
    // longer need it — they spawn through the user's own login shell, which resolves PATH for itself
    // (see command.ts's toSpawnForm).
    const correctedPath = shouldCorrectPath(process.platform, app.isPackaged)
      ? resolveShellPath({
          platform: process.platform,
          shell: process.env.SHELL,
          home: homedir(),
          currentPath: process.env.PATH,
          probe: () => shellEnv?.path ?? null,
        })
      : null;
    // Wrap the user's statusLine so live cost/context and account rate limits flow to the app.
    // Idempotent and reversible; a failure must never cost the user a window. Gated on the user's
    // durable preference — a Settings-page Disable must survive relaunch, not silently re-install.
    const settingsManager = createSettingsManager({ claudeDir });
    let statuslineLaunchFault: string | null = null;
    if (appSettings.read().statuslineEnabled ?? true) {
      try {
        const result = settingsManager.install();
        if (result.healed) {
          console.warn(
            "statusLine install was desynced (missing record or externally stripped entry); " +
              "recovered the original command and reinstalled",
          );
        }
      } catch (err) {
        statuslineLaunchFault = (err as Error).message;
        console.error(
          "statusLine install failed; live rate limits and cost will be unavailable",
          err,
        );
      }
    }
    const statusLine = createStatusLineReader({ claudeDir });
    // Codex has no login-shell recovery yet: resolveCodexDir reads CODEX_HOME/well-known-dir
    // directly, unlike claudeDir's recovered-config-dir path above.
    const codexDir = resolveCodexDir();
    const recentWindowMs = readSessionWindowMs(claudeDir);
    const claudeProvider = createClaudeProvider({
      managed,
      claudeDir,
      recentWindowMs,
    });
    // Codex account rate limits: OAuth wham/usage first (auth.json read-only), app-server fallback.
    // Same lazy-refresh contract as the claude usage service — refreshes ride renderer polls only.
    const codexLimits = createCodexLimitsService({
      codexDir,
      fetchFn: net.fetch.bind(net),
    });
    const codexProvider = createCodexProvider({
      codexDir,
      recentWindowMs,
      limits: codexLimits,
      managed: {
        has: (id) => managed.agentOf(id) === "codex",
        cwdOf: (id) => managed.cwdOf(id),
      },
    });
    // id → agent: live drafts answer from the registry; indexed rows from the sessions table;
    // anything unknown is claude (the legacy default — never a projects/ sweep for a codex id).
    const agentOf = (id: string): AgentId =>
      managed.agentOf(id) ?? getSessionAgent(db, id) ?? "claude";
    const provider = createCompositeProvider(
      { claude: claudeProvider, codex: codexProvider },
      agentOf,
    );
    services.provider = provider;
    const sessionTitles = createSessionTitleStore({
      dir: app.getPath("userData"),
    });
    const sessionPins = createSessionPinStore({
      dir: app.getPath("userData"),
    });
    const cliStatus = createCliStatusController({
      configDirs: { claude: claudeDir, codex: codexDir },
    });
    services.cliStatus = cliStatus;
    // Warm every agent's verdict in the background; each check is async and the window is already up.
    setTimeout(() => {
      for (const agent of AGENT_IDS) {
        void cliStatus.recheck(agent).catch((err: unknown) => {
          console.error(`initial CLI status check failed for ${agent}`, err);
        });
      }
    }, 0);
    let emailCache: string | null | undefined;
    const accountEmail = (): string | null => {
      if (emailCache === undefined) emailCache = readAccountEmail(claudeDir);
      return emailCache;
    };
    // Account usage via the OAuth usage API: constructed once; refreshes are spawned inside
    // renderer polls only (window closed → polls stop → refreshes stop). net.fetch rides
    // Chromium's stack (system proxy, OS certs). The cache file is OURS — never another tool's.
    const usage = createUsageService({
      fetchFn: net.fetch.bind(net),
      readToken: createTokenReader({ claudeDir }),
      cachePath: join(app.getPath("userData"), "usage-cache.json"),
    });
    // Read once per app run — editing settings.json while
    // the app is running won't change the model picker until restart.
    let modelDefaultsCache: ModelDefaults | undefined;
    const modelDefaults = (): ModelDefaults => {
      if (modelDefaultsCache === undefined)
        modelDefaultsCache = readModelDefaults(claudeDir, process.env);
      return modelDefaultsCache;
    };
    // Before each discovery sweep, follow any /clear that rotated a Managed pty's session id: relabel the
    // registry and re-key the live pty + renderer, so the rotated session stays Managed instead of being
    // re-derived as a read-only Observed one.
    const reconcile = (): void => {
      applyRotations(
        {
          entries: () => managed.entriesFor("claude"),
          rename: (from, to) => managed.rename(from, to),
        },
        () => readSessionFiles(claudeDir),
        renameInWindow,
      );
      // Codex claims land in the same beforeSync slot, so the re-key + rollout binding hit the
      // very pass that first discovers the rollout — no duplicate-row window between polls. Order
      // vs. the rotation pass above doesn't matter: the two tracks touch disjoint managed entries
      // (claude-agent vs codex-agent ids), so neither can observe the other's rename.
      applyClaims({
        ptys: managed.codexEntries(),
        claimedRollouts: managed.claimedRollouts(),
        listRollouts: () => listRollouts(codexDir),
        readHead: (path) => readRolloutHead(path),
        apply: ({ from, to, rolloutPath }) => {
          managed.rename(from, to);
          managed.claim(to, rolloutPath);
          sessionTitles.rename(from, to);
          sessionPins.rename(from, to);
          renameInWindow(from, to);
        },
      });
    };
    const caffeinate = createCaffeinate({ blocker: powerSaveBlocker });
    const { sync } = registerIpc({
      db,
      provider,
      statusLine,
      accountEmail,
      modelDefaults,
      beforeSync: reconcile,
      analyticsDb,
      analyticsDbPath,
      claudeDir,
      cliStatus,
      sessionTitles,
      sessionPins,
      updater,
      appSettings,
      settingsManager,
      statuslineLaunchFault,
      caffeinate,
      usage,
      sessionOverlays: [(sessions) => codexProvider.overlaySessions(sessions)],
    });

    // One-shot launch check: packaged only, and only when the user hasn't turned it off. Deferred so it
    // never blocks first paint (mirrors the setTimeout'd CLI check). No recurring timer — see the
    // "renderer polls; no main timers" invariant; this fires once per launch.
    if (app.isPackaged && (appSettings.read().autoCheckUpdates ?? true)) {
      setTimeout(() => void updater.check(), 3000);
    }

    try {
      sync(); // incremental parse of ~/.claude → SQLite; the window's first overview() is served right after
    } catch (err) {
      // A failed sync must not cost the user a window. Open with an empty list;
      // a manual Refresh retries, and surfacing the error in the UI is a later issue.
      console.error(
        "initial session sync failed; opening the window anyway",
        err,
      );
    }
  })
  .catch((err) => {
    // Last resort: never let a startup throw vanish as a silent unhandled rejection.
    console.error("failed to start the app", err);
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
