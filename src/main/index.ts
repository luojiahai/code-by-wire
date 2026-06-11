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
import { readAccountEmail } from './settings/account-email'
import { resolveClaudeDir } from './claude-config'

function createWindow(
  managed: ManagedRegistry,
  resolveAdoptTarget: (id: string) => { alive: boolean; cwd: string } | null,
  registerRename: (rename: (from: string, to: string) => void) => void,
): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: '#0c0c0d',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  // Managed-terminal IPC is per-window: the manager pushes pty output to this window's renderer and
  // kills its ptys when the window closes. Its `rename` (the /clear follow) is handed to the sync
  // reconcile and revoked when the window closes.
  const { rename } = registerTerminalIpc({ window: win, managed, resolveAdoptTarget })
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
      createSettingsManager().install()
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
    const { sync } = registerIpc({ db, provider, statusLine, accountEmail, beforeSync: reconcile })

    try {
      sync() // incremental parse of ~/.claude → SQLite once, before the window asks for rows
    } catch (err) {
      // A failed sync must not cost the user a window. Open with an empty list;
      // a manual Refresh retries, and surfacing the error in the UI is a later issue.
      console.error('initial session sync failed; opening the window anyway', err)
    }

    createWindow(managed, provider.resolveAdoptTarget, registerRename)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0)
        createWindow(managed, provider.resolveAdoptTarget, registerRename)
    })
  })
  .catch((err) => {
    // Last resort: never let a startup throw vanish as a silent unhandled rejection.
    console.error('failed to start the app', err)
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
