import { describe, it, expect } from 'vitest'
import type { ContextBreakdown } from '@shared/transcript'
import { contextTotal, contextSegments, contextView } from '@shared/context'

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

describe('contextView', () => {
  it('prefers the live split and the captured percentage', () => {
    const live = ctx({ input: 2, cacheRead: 203_420, cacheCreation: 2770 })
    const view = contextView({ live, fallback: ctx({ input: 999 }), capturedPct: 21, window: 1_000_000 })
    expect(view).toEqual({
      total: 206_192,
      pct: 21, // straight from used_percentage, NOT 206192/1_000_000
      segments: contextSegments(live),
    })
  })

  it('derives the live percentage from tokens-over-window when the capture omitted used_percentage', () => {
    const live = ctx({ input: 0, cacheRead: 100_000, cacheCreation: 0 })
    expect(contextView({ live, fallback: null, capturedPct: null, window: 200_000 })?.pct).toBe(50)
  })

  it('falls back to the transcript split over the window when there is no live split', () => {
    const fallback = ctx({ input: 0, cacheRead: 80_000, cacheCreation: 0 })
    const view = contextView({ live: null, fallback, capturedPct: null, window: 200_000 })
    expect(view).toEqual({ total: 80_000, pct: 40, segments: contextSegments(fallback) })
  })

  it('is null when neither source has any context', () => {
    expect(contextView({ live: null, fallback: null, capturedPct: 50, window: 200_000 })).toBeNull()
  })
})
