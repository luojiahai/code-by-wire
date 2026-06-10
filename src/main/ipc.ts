import { ipcMain } from 'electron'
import { IPC, type OverviewData } from '@shared/ipc'
import type { Provider } from './provider/types'
import type { SqliteDb } from './db/driver'
import type { StatusLineReader } from '@shared/statusline'
import { deriveAccount, overlaySessions, freshestBySession } from '@shared/statusline'
import { getOverview } from './db/store'
import { syncSessions } from './sync'

export interface IpcDeps {
  db: SqliteDb
  provider: Provider
  /** Live statusLine captures. Defaults to "no captures" so the index still serves without them. */
  statusLine?: StatusLineReader
}

/** A capture older than the 7-day window can't describe it, so it can't define the account either. */
const STALE_MS = 7 * 24 * 60 * 60 * 1000

export function registerIpc({ db, provider, statusLine }: IpcDeps): { sync: () => void } {
  const reader: StatusLineReader = statusLine ?? { read: () => [] }

  const sync = (): void => {
    syncSessions(db, provider)
  }

  /** The index snapshot enriched with the live statusLine overlay: per-session cost/context/lines, plus
   *  the app-wide account. Both handlers go through here so the list and the account share one read. */
  const overviewNow = (): OverviewData => {
    const now = Date.now()
    const base = getOverview(db, now)
    const samples = reader.read()
    return {
      ...base,
      sessions: overlaySessions(base.sessions, freshestBySession(samples)),
      account: deriveAccount(samples, now, STALE_MS),
    }
  }

  ipcMain.handle(IPC.overview, () => overviewNow())
  ipcMain.handle(IPC.refresh, () => {
    try {
      sync()
    } catch (err) {
      // A failed refresh (e.g. ~/.claude briefly unreadable) must not reject to the renderer or
      // drop the list. Serve the last-known rows and let the next Refresh retry, like launch does.
      console.error('refresh sync failed; serving last-known rows', err)
    }
    return overviewNow()
  })
  ipcMain.handle(IPC.capabilities, () => provider.capabilities)
  ipcMain.handle(IPC.readTranscript, (_e, id: string, sinceMtimeMs?: number) =>
    provider.readTranscript(id, sinceMtimeMs),
  )

  return { sync }
}
