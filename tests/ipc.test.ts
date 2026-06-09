import { describe, it, expect, vi } from 'vitest'
import type { Session, PersistedSession } from '@shared/types'
import { IPC } from '@shared/ipc'
import type { Provider } from '../src/main/provider/types'

// Capture the handlers registerIpc registers, without a real Electron ipcMain.
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...a: unknown[]) => unknown>() }))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (...a: unknown[]) => unknown) => handlers.set(channel, fn) },
}))

import { registerIpc } from '../src/main/ipc'
import { migrate, upsertSessions } from '../src/main/db/store'
import { openTestDb } from './helpers/sqlite'

const seed: PersistedSession = {
  id: 'seed',
  title: 'Seeded',
  project: 'p',
  branch: undefined,
  state: 'idle',
  management: 'observed',
  model: 'claude-opus-4-8',
  lastActivityMs: 1,
  awaitingUser: false,
  transcriptMtimeMs: 0,
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  contextTokens: 0,
}

const provider = (listCandidates: Provider['listCandidates']): Provider => ({
  id: 'fake',
  capabilities: { canControl: false, hasRateLimits: false, hasSubagents: false },
  listCandidates,
  summarize: (c) => ({ ...seed, id: c.id }),
  restate: (_c, prev) => prev,
})

describe('registerIpc refresh', () => {
  it('serves the last-known rows when a sync throws, instead of rejecting to the renderer', () => {
    const db = openTestDb()
    migrate(db)
    upsertSessions(db, [seed])
    registerIpc({
      db,
      provider: provider(() => {
        throw new Error('EACCES: ~/.claude unreadable')
      }),
    })

    const refresh = handlers.get(IPC.refresh)!
    let rows: Session[] = []
    expect(() => {
      rows = refresh() as Session[]
    }).not.toThrow()
    expect(rows.map((s) => s.id)).toEqual(['seed'])
  })
})
