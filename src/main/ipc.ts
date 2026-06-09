import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { Provider } from './provider/types'
import type { SqliteDb } from './db/driver'
import { getSessions } from './db/store'
import { syncSessions } from './sync'

export interface IpcDeps {
  db: SqliteDb
  provider: Provider
}

export function registerIpc({ db, provider }: IpcDeps): { sync: () => void } {
  const sync = (): void => {
    syncSessions(db, provider)
  }

  ipcMain.handle(IPC.listSessions, () => getSessions(db))
  ipcMain.handle(IPC.refresh, () => {
    sync()
    return getSessions(db)
  })
  ipcMain.handle(IPC.capabilities, () => provider.capabilities)

  return { sync }
}
