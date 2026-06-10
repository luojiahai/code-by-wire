import { describe, it, expect } from 'vitest'
import type { Session } from '../../src/shared/types'
import { applyAdopting } from '../../src/shared/managed'

const s = (id: string, over: Partial<Session> = {}): Session => ({
  id,
  title: id,
  project: 'p',
  state: 'ended',
  management: 'observed',
  model: 'claude-sonnet-4-6',
  contextPct: 0,
  contextWindow: 200_000,
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  equivApiValueUsd: 0,
  lastActivityMs: 0,
  ...over,
})

describe('applyAdopting', () => {
  it('forces an adopting id to Managed and flips Ended to Working', () => {
    const [row] = applyAdopting([s('a')], new Set(['a']))
    expect(row.management).toBe('managed')
    expect(row.state).toBe('working')
  })

  it('leaves non-adopting rows untouched', () => {
    const [row] = applyAdopting([s('b')], new Set(['a']))
    expect(row.management).toBe('observed')
    expect(row.state).toBe('ended')
  })

  it('forces Managed but preserves a non-ended state', () => {
    const [row] = applyAdopting([s('c', { state: 'idle' })], new Set(['c']))
    expect(row.management).toBe('managed')
    expect(row.state).toBe('idle')
  })

  it('returns the same array reference when nothing is adopting', () => {
    const rows = [s('d')]
    expect(applyAdopting(rows, new Set())).toBe(rows)
  })
})
