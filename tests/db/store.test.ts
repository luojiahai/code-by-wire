import { describe, it, expect } from 'vitest'
import type { PersistedSession } from '@shared/types'
import {
  migrate,
  upsertSessions,
  getPersisted,
  getSessions,
  hydrate,
  pruneSessions,
} from '../../src/main/db/store'
import { openTestDb } from '../helpers/sqlite'

const snap = (over: Partial<PersistedSession> = {}): PersistedSession => ({
  id: 'id-1',
  title: 'Title',
  project: 'proj',
  branch: 'main',
  state: 'idle',
  management: 'observed',
  model: 'claude-opus-4-8',
  lastActivityMs: 1000,
  awaitingUser: false,
  transcriptMtimeMs: 500,
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  contextTokens: 0,
  ...over,
})

describe('store', () => {
  it('migrates to the current schema and is idempotent', () => {
    const db = openTestDb()
    migrate(db)
    migrate(db) // second call is a no-op, not an error
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(3)
  })

  it('round-trips a snapshot, coercing missing branch and the awaitingUser flag', () => {
    const db = openTestDb()
    migrate(db)
    const s = snap({
      branch: undefined,
      awaitingUser: true,
      transcriptMtimeMs: 42,
      usage: { inputTokens: 7, outputTokens: 8, cacheReadTokens: 9, cacheCreationTokens: 10 },
      contextTokens: 11,
    })
    upsertSessions(db, [s])
    expect(getPersisted(db)).toEqual([s])
  })

  it('upserts by id rather than inserting duplicates', () => {
    const db = openTestDb()
    migrate(db)
    upsertSessions(db, [snap({ state: 'working' })])
    upsertSessions(db, [snap({ state: 'ended', title: 'Renamed' })])
    const rows = getPersisted(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].state).toBe('ended')
    expect(rows[0].title).toBe('Renamed')
  })

  it('hydrates a zero-usage snapshot to zero cost and context', () => {
    const s = hydrate(snap({ model: 'claude-sonnet-4-6' }))
    expect(s.contextPct).toBe(0)
    expect(s.contextWindow).toBe(200_000)
    expect(s.usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 })
    expect(s.equivApiValueUsd).toBe(0)
    expect(s.model).toBe('claude-sonnet-4-6')
    expect(s.state).toBe('idle')
  })

  it('computes context % and Equivalent API value from real usage', () => {
    const s = hydrate(
      snap({
        model: 'claude-opus-4-8',
        usage: { inputTokens: 100_000, outputTokens: 20_000, cacheReadTokens: 400_000, cacheCreationTokens: 10_000 },
        contextTokens: 100_000,
      }),
    )
    expect(s.contextWindow).toBe(200_000) // every family defaults to the standard 200K
    expect(s.contextPct).toBe(50) // 100000 / 200000
    expect(s.equivApiValueUsd).toBeCloseTo(1.2625) // opus rates
    expect(s.usage.cacheReadTokens).toBe(400_000) // raw usage carries through untouched
  })

  it('derives the 200K default window for an uncaptured Opus session', () => {
    const s = hydrate(snap({ model: 'claude-opus-4-8', contextTokens: 50_000 }))
    expect(s.contextWindow).toBe(200_000)
    expect(s.contextPct).toBe(25) // 50000 / 200000
  })

  it('clamps context % at 100 when context exceeds the window', () => {
    // A Sonnet/Haiku session on the 1M beta is modeled with a 200K window, so its real context can
    // run past that. Context % must not render above 100.
    const s = hydrate(snap({ model: 'claude-sonnet-4-6', contextTokens: 600_000 }))
    expect(s.contextWindow).toBe(200_000)
    expect(s.contextPct).toBe(100)
  })

  it('serves sessions freshest-first', () => {
    const db = openTestDb()
    migrate(db)
    upsertSessions(db, [snap({ id: 'old', lastActivityMs: 1 }), snap({ id: 'new', lastActivityMs: 9 })])
    expect(getSessions(db).map((s) => s.id)).toEqual(['new', 'old'])
  })

  it('prunes ids outside the keep-set, and clears all on an empty keep-set', () => {
    const db = openTestDb()
    migrate(db)
    upsertSessions(db, [snap({ id: 'a' }), snap({ id: 'b' }), snap({ id: 'c' })])
    pruneSessions(db, ['a', 'c'])
    expect(getPersisted(db).map((s) => s.id).sort()).toEqual(['a', 'c'])
    pruneSessions(db, [])
    expect(getPersisted(db)).toEqual([])
  })
})
