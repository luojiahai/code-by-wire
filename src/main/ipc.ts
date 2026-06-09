import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { Provider } from './provider/types'
import type { SqliteDb } from './db/driver'
import { getOverview } from './db/store'
import { syncSessions } from './sync'

export interface IpcDeps {
  db: SqliteDb
  provider: Provider
}

export function registerIpc({ db, provider }: IpcDeps): { sync: () => void } {
  const sync = (): void => {
    syncSessions(db, provider)
  }

  ipcMain.handle(IPC.overview, () => getOverview(db, Date.now()))
  ipcMain.handle(IPC.refresh, () => {
    try {
      sync()
    } catch (err) {
      // A failed refresh (e.g. ~/.claude briefly unreadable) must not reject to the renderer or
      // drop the list. Serve the last-known rows and let the next Refresh retry, like launch does.
      console.error('refresh sync failed; serving last-known rows', err)
    }
    return getOverview(db, Date.now())
  })
  ipcMain.handle(IPC.capabilities, () => provider.capabilities)
  ipcMain.handle(IPC.readTranscript, (_e, id: string, sinceMtimeMs?: number) =>
    provider.readTranscript(id, sinceMtimeMs),
  )

  return { sync }
}
