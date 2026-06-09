import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { openDb } from './db/sqlite'
import { migrate } from './db/store'
import { createClaudeProvider } from './provider/claude'
import { registerIpc } from './ipc'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: '#141413',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

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
    const provider = createClaudeProvider()
    const { sync } = registerIpc({ db, provider })

    try {
      sync() // incremental parse of ~/.claude → SQLite once, before the window asks for rows
    } catch (err) {
      // A failed sync must not cost the user a window. Open with an empty list;
      // a manual Refresh retries, and surfacing the error in the UI is a later issue.
      console.error('initial session sync failed; opening the window anyway', err)
    }

    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((err) => {
    // Last resort: never let a startup throw vanish as a silent unhandled rejection.
    console.error('failed to start the app', err)
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
