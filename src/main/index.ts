import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { openDb } from './db/sqlite'
import { migrate } from './db/store'
import { createClaudeProvider } from './provider/claude'
import { createManagedRegistry } from './managed-registry'
import type { ManagedRegistry } from './managed-registry'
import { applyRotations } from './provider/claude/rotation'
import { readSessionFiles } from './provider/claude/discover'
import { registerIpc } from './ipc'
import { createSettingsManager } from './settings/manager'
import { createStatusLineReader } from './statusline/reader'
import { registerTerminalIpc } from './terminal/ipc'
import { shellPath } from './terminal/shell-path'
import { readAccountEmail } from './settings/account-email'
import { readApiConfig, type ApiConfig } from './settings/api-config'
import { resolveClaudeDir } from './claude-config'
import { HEADER_HEIGHT_PX, MAC_TRAFFIC_LIGHT_POSITION } from '@shared/chrome'

// Pin the whole app to the sRGB color profile. Without this, the packaged build inherits the
// display's profile (Display P3 on modern Macs) and Chromium stretches our sRGB-authored palette
// toward that wider gamut, oversaturating colors like the Claude Code mascot orange. Dev already
// renders sRGB, so this only changes the packaged build, making it match dev. Must run before the
// 'ready' event (before the GPU process starts), so it lives at module top level.
app.commandLine.appendSwitch('force-color-profile', 'srgb')

function createWindow(
  managed: ManagedRegistry,
  resolveAdoptTarget: (id: string) => { alive: boolean; cwd: string } | null,
  registerRename: (rename: (from: string, to: string) => void) => void,
  childEnv: (() => NodeJS.ProcessEnv) | undefined,
): void {
  // The renderer header is a fixed HEADER_HEIGHT_PX tall and doubles as the title bar. On macOS we hide
  // the native title bar but KEEP the traffic lights (titleBarStyle 'hidden', never frame:false — the
  // same choice VS Code makes), float them into the header, and offset native sheets (the directory
  // picker) below the header so they don't clip under it. Windows/Linux keep their default frame.
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: '#0c0c0d',
    ...(isMac ? { titleBarStyle: 'hidden' as const, trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })
  if (isMac) win.setSheetOffset(HEADER_HEIGHT_PX)

  // Managed-terminal IPC is per-window: the manager pushes pty output to this window's renderer and
  // kills its ptys when the window closes. Its `rename` (the /clear follow) is handed to the sync
  // reconcile and revoked when the window closes.
  const { rename } = registerTerminalIpc({ window: win, managed, resolveAdoptTarget, env: childEnv })
  registerRename(rename)
  win.on('closed', () => registerRename(() => {}))

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady()
  .then(async () => {
    const db = openDb(join(app.getPath('userData'), 'index.db'))
    migrate(db) // bring the index schema up to date before the first sync
    // The registry of app-spawned ids, shared by reference: the terminal IPC writes it on spawn, the
    // provider reads it to label discovered sessions Managed.
    const managed = createManagedRegistry()
    // Wrap the user's statusLine so live cost/context and account rate limits flow to the app
    // (ADR-0001). Idempotent and reversible; a failure must never cost the user a window.
    try {
      const result = createSettingsManager().install()
      if (result.healed) {
        console.warn('statusLine state.json was missing; recovered the original command from the wrapper and reinstalled')
      }
    } catch (err) {
      console.error('statusLine install failed; live rate limits and cost will be unavailable', err)
    }
    const statusLine = createStatusLineReader()
    const provider = createClaudeProvider({ managed })
    const claudeDir = resolveClaudeDir()
    let emailCache: string | null | undefined
    const accountEmail = (): string | null => {
      if (emailCache === undefined) emailCache = readAccountEmail(claudeDir)
      return emailCache
    }
    let apiConfigCache: ApiConfig | null | undefined
    const apiConfig = (): ApiConfig | null => {
      if (apiConfigCache === undefined) apiConfigCache = readApiConfig(claudeDir)
      return apiConfigCache
    }
    // The live window's terminal-rename hook, set when a window opens and revoked when it closes. The
    // reconcile (below) calls through it to follow a /clear, so it's a no-op before the first window.
    let renameInWindow: (from: string, to: string) => void = () => {}
    const registerRename = (rename: (from: string, to: string) => void): void => {
      renameInWindow = rename
    }
    // Before each discovery sweep, follow any /clear that rotated a Managed pty's session id: relabel the
    // registry and re-key the live pty + renderer, so the rotated session stays Managed instead of being
    // re-derived as a read-only Observed one.
    const reconcile = (): void => {
      applyRotations(managed, () => readSessionFiles(claudeDir), renameInWindow)
    }
    const { sync } = registerIpc({ db, provider, statusLine, accountEmail, apiConfig, beforeSync: reconcile })

    try {
      sync() // incremental parse of ~/.claude → SQLite once, before the window asks for rows
    } catch (err) {
      // A failed sync must not cost the user a window. Open with an empty list;
      // a manual Refresh retries, and surfacing the error in the UI is a later issue.
      console.error('initial session sync failed; opening the window anyway', err)
    }

    // A packaged .app launched from Finder inherits launchd's bare PATH, not the user's shell PATH, so
    // `claude` (under ~/.local/bin etc.) wouldn't be found and every Managed session would die at spawn.
    // Recover the real PATH and hand it to each window's terminal IPC — but lazily, on the first spawn,
    // so the synchronous shell probe never blocks the first window's paint; memoized so only that spawn
    // pays it. In dev the inherited PATH already carries `claude`, so leave the env untouched (no probe).
    let recoveredEnv: NodeJS.ProcessEnv | undefined
    const childEnv = app.isPackaged
      ? (): NodeJS.ProcessEnv => (recoveredEnv ??= { ...process.env, PATH: shellPath() })
      : undefined
    createWindow(managed, provider.resolveAdoptTarget, registerRename, childEnv)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0)
        createWindow(managed, provider.resolveAdoptTarget, registerRename, childEnv)
    })
  })
  .catch((err) => {
    // Last resort: never let a startup throw vanish as a silent unhandled rejection.
    console.error('failed to start the app', err)
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
