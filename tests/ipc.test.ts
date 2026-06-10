import { describe, it, expect, vi } from 'vitest'
import type { PersistedSession } from '@shared/types'
import { IPC, type OverviewData } from '@shared/ipc'
import type { Provider } from '../src/main/provider/types'
import type { StatusLineReader, StatusLineSample } from '@shared/statusline'

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
  readTranscript: () => ({ status: 'absent' }),
  readTasks: () => ({ status: 'absent' }),
  resolveAdoptTarget: () => null,
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
    let result: OverviewData | undefined
    expect(() => {
      result = refresh() as OverviewData
    }).not.toThrow()
    expect(result?.sessions.map((s) => s.id)).toEqual(['seed'])
  })
})

describe('registerIpc readTranscript', () => {
  it('delegates to the provider (absent when no transcript)', () => {
    const db = openTestDb()
    migrate(db)
    registerIpc({ db, provider: provider(() => []) })
    const handler = handlers.get(IPC.readTranscript)!
    expect(handler({}, 'any-id')).toEqual({ status: 'absent' })
  })
})

describe('registerIpc overview', () => {
  it('returns the seeded sessions and their index aggregates from one read', () => {
    const db = openTestDb()
    migrate(db)
    upsertSessions(db, [seed]) // opus, project 'p', zero usage
    registerIpc({ db, provider: provider(() => []) })

    const handler = handlers.get(IPC.overview)!
    const o = handler() as OverviewData
    expect(o.sessions.map((s) => s.id)).toEqual(['seed'])
    expect(o.stats.weeklyActivity).toHaveLength(7)
    expect(o.stats.modelMix).toEqual([{ model: 'claude-opus-4-8', sessions: 1, equivApiValueUsd: 0 }])
    expect(o.stats.projectRollup).toEqual([{ project: 'p', sessions: 1, equivApiValueUsd: 0 }])
  })
})

const lineSample = (over: Partial<StatusLineSample> = {}): StatusLineSample => ({
  sessionId: 'seed',
  capturedMtimeMs: Date.now(),
  costUsd: null,
  linesAdded: null,
  linesRemoved: null,
  contextPct: null,
  contextWindow: null,
  liveContext: null,
  modelId: null,
  modelDisplayName: null,
  sessionName: null,
  rateLimits: null,
  ...over,
})

const reader = (samples: StatusLineSample[]): StatusLineReader => ({ read: () => samples })

describe('registerIpc overview — statusLine overlay', () => {
  it('overlays live cost/context onto the matching session and derives a subscription account', () => {
    const db = openTestDb()
    migrate(db)
    upsertSessions(db, [seed]) // id 'seed', opus, zero computed usage → equivApiValueUsd 0
    registerIpc({
      db,
      provider: provider(() => []),
      statusLine: reader([
        lineSample({
          sessionId: 'seed',
          costUsd: 1.25,
          linesAdded: 10,
          linesRemoved: 2,
          contextPct: 47,
          rateLimits: { fiveHour: { usedPct: 20, resetsAt: Date.now() + 3_600_000 } },
        }),
      ]),
    })

    const o = (handlers.get(IPC.overview)!() as OverviewData)
    expect(o.account).toEqual({ billingMode: 'subscription', fiveHour: { usedPct: 20, resetsAt: expect.any(Number) }, sevenDay: undefined })
    const s = o.sessions.find((x) => x.id === 'seed')!
    expect(s.liveCostUsd).toBe(1.25)
    expect(s.linesAdded).toBe(10)
    expect(s.contextPct).toBe(47)
  })

  it('serves account null and untouched computed values when there is no statusLine data (AC #4)', () => {
    const db = openTestDb()
    migrate(db)
    upsertSessions(db, [seed])
    registerIpc({ db, provider: provider(() => []), statusLine: reader([]) })

    const o = handlers.get(IPC.overview)!() as OverviewData
    expect(o.account).toBeNull()
    const s = o.sessions.find((x) => x.id === 'seed')!
    expect(s.liveCostUsd).toBeUndefined()
    expect(s.equivApiValueUsd).toBe(0) // computed, still present
  })

  it('defaults to no live data when no statusLine reader is provided', () => {
    const db = openTestDb()
    migrate(db)
    upsertSessions(db, [seed])
    registerIpc({ db, provider: provider(() => []) }) // no statusLine dep

    const o = handlers.get(IPC.overview)!() as OverviewData
    expect(o.account).toBeNull()
  })
})
