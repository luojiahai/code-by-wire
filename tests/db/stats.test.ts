import { describe, it, expect } from 'vitest'
import type { PersistedSession } from '@shared/types'
import { migrate, upsertSessions, getStats } from '../../src/main/db/store'
import { openTestDb } from '../helpers/sqlite'

const DAY = 86_400_000
const TODAY = Math.floor(1_700_000_000_000 / DAY) * DAY
const NOW = TODAY + 12 * 3_600_000

const snap = (over: Partial<PersistedSession> = {}): PersistedSession => ({
  id: 'id-1',
  title: 'Title',
  project: 'proj',
  branch: undefined,
  state: 'idle',
  management: 'observed',
  model: 'claude-opus-4-8',
  lastActivityMs: NOW,
  awaitingUser: false,
  transcriptMtimeMs: 0,
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  contextTokens: 0,
  ...over,
})

const OPUS_USAGE = { inputTokens: 100_000, outputTokens: 20_000, cacheReadTokens: 400_000, cacheCreationTokens: 10_000 }

describe('getStats', () => {
  it('aggregates seeded rows from a scratch index', () => {
    const db = openTestDb()
    migrate(db)
    upsertSessions(db, [
      snap({ id: 'a', project: 'alpha', model: 'claude-opus-4-8', lastActivityMs: TODAY, usage: OPUS_USAGE }),
      snap({ id: 'b', project: 'alpha', model: 'claude-sonnet-4-6', lastActivityMs: TODAY - DAY, usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } }), // $3.00
      snap({ id: 'c', project: 'beta', model: 'claude-opus-4-8', lastActivityMs: TODAY - 2 * DAY, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } }), // $0
    ])

    const s = getStats(db, NOW)

    // Trend: 7 buckets oldest-first; one session on each of today, -1d, -2d.
    expect(s.weeklyActivity).toHaveLength(7)
    expect(s.weeklyActivity[6].sessions).toBe(1) // today
    expect(s.weeklyActivity[6].equivApiValueUsd).toBeCloseTo(1.2625) // opus OPUS_USAGE
    expect(s.weeklyActivity[5].sessions).toBe(1) // yesterday (sonnet $3)
    expect(s.weeklyActivity[5].equivApiValueUsd).toBeCloseTo(3.0)
    expect(s.weeklyActivity[4].sessions).toBe(1) // 2 days ago
    expect(s.weeklyActivity[4].equivApiValueUsd).toBe(0) // the $0 beta row — zero isn't dropped

    // Model mix: sorted by value desc — sonnet ($3.00) ahead of opus ($1.2625).
    expect(s.modelMix.map((m) => m.model)).toEqual(['claude-sonnet-4-6', 'claude-opus-4-8'])
    expect(s.modelMix[0].sessions).toBe(1) // sonnet: one row
    const opus = s.modelMix.find((m) => m.model === 'claude-opus-4-8')!
    expect(opus.sessions).toBe(2) // rows a and c
    expect(opus.equivApiValueUsd).toBeCloseTo(1.2625)

    // Project rollup: alpha ($1.2625 + $3.00) ahead of beta ($0).
    expect(s.projectRollup).toEqual([
      { project: 'alpha', sessions: 2, equivApiValueUsd: expect.closeTo(4.2625, 4) },
      { project: 'beta', sessions: 1, equivApiValueUsd: 0 },
    ])
  })

  it('returns 7 empty buckets and empty mix/rollup for an empty index', () => {
    const db = openTestDb()
    migrate(db)
    const s = getStats(db, NOW)
    expect(s.weeklyActivity).toHaveLength(7)
    expect(s.weeklyActivity.every((d) => d.sessions === 0)).toBe(true)
    expect(s.modelMix).toEqual([])
    expect(s.projectRollup).toEqual([])
  })
})
