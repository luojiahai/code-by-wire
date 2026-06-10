import { describe, it, expect } from 'vitest'
import type { ContextBreakdown } from '@shared/transcript'
import {
  AUTO_COMPACT_FRACTION,
  contextTotal,
  contextSegments,
  tokensUntilAutoCompact,
} from '@shared/context'

const ctx = (over: Partial<ContextBreakdown> = {}): ContextBreakdown => ({
  input: 0,
  cacheRead: 0,
  cacheCreation: 0,
  ...over,
})

describe('contextTotal', () => {
  it('sums the three cache-state parts', () => {
    expect(contextTotal(ctx({ input: 2, cacheRead: 78_533, cacheCreation: 2175 }))).toBe(80_710)
  })
})

describe('contextSegments', () => {
  it('labels each part with its share of the in-use total, largest first', () => {
    expect(contextSegments(ctx({ input: 2, cacheRead: 78_533, cacheCreation: 2175 }))).toEqual([
      { key: 'cacheRead', label: 'Cached · stable', tokens: 78_533, pct: 97 },
      { key: 'cacheCreation', label: 'New this turn', tokens: 2175, pct: 3 },
      { key: 'input', label: 'Fresh input', tokens: 2, pct: 0 },
    ])
  })

  it('yields zero-pct segments for an empty context, never NaN', () => {
    expect(contextSegments(ctx()).map((s) => s.pct)).toEqual([0, 0, 0])
  })
})

describe('tokensUntilAutoCompact', () => {
  it('is window·fraction minus the current total, floored at 0', () => {
    expect(AUTO_COMPACT_FRACTION).toBe(0.92)
    expect(tokensUntilAutoCompact(80_710, 1_000_000)).toBe(839_290) // 920000 − 80710
    expect(tokensUntilAutoCompact(990_000, 1_000_000)).toBe(0) // already past the threshold
    expect(tokensUntilAutoCompact(100, 0)).toBe(0) // unknown window
  })
})
