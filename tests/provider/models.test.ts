import { describe, it, expect } from 'vitest'
import { normalizeModelId, contextWindowFor, priceFor, equivApiValue } from '@shared/models'
import type { Usage } from '@shared/types'

describe('normalizeModelId', () => {
  it('maps known model strings to canonical ids', () => {
    expect(normalizeModelId('claude-opus-4-8')).toBe('claude-opus-4-8')
    expect(normalizeModelId('claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
    expect(normalizeModelId('claude-haiku-4-5')).toBe('claude-haiku-4-5')
  })

  it('matches by family across suffixes (date stamps, [1m]) and defaults unknowns to opus', () => {
    expect(normalizeModelId('claude-opus-4-8[1m]')).toBe('claude-opus-4-8')
    expect(normalizeModelId('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5')
    expect(normalizeModelId(undefined)).toBe('claude-opus-4-8')
    expect(normalizeModelId('something-weird')).toBe('claude-opus-4-8')
  })
})

describe('contextWindowFor', () => {
  it('is a fixed per-family window: Opus 1M, others 200K', () => {
    expect(contextWindowFor('claude-opus-4-8')).toBe(1_000_000)
    expect(contextWindowFor('claude-sonnet-4-6')).toBe(200_000)
    expect(contextWindowFor('claude-haiku-4-5')).toBe(200_000)
  })
})

describe('priceFor', () => {
  it('distinguishes input / output / cache-read / cache-write rates per model', () => {
    expect(priceFor('claude-opus-4-8')).toEqual({ input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 })
    expect(priceFor('claude-sonnet-4-6')).toEqual({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 })
    expect(priceFor('claude-haiku-4-5')).toEqual({ input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 })
  })
})

describe('equivApiValue', () => {
  const usage = (over: Partial<Usage> = {}): Usage => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    ...over,
  })

  it('is zero with no tokens', () => {
    expect(equivApiValue(usage(), 'claude-opus-4-8')).toBe(0)
  })

  it('prices each token kind at its per-million rate and sums them', () => {
    // 1M input at opus $5/M = $5; 1M cache-read at $0.50/M = $0.50.
    expect(equivApiValue(usage({ inputTokens: 1_000_000 }), 'claude-opus-4-8')).toBeCloseTo(5)
    expect(equivApiValue(usage({ cacheReadTokens: 1_000_000 }), 'claude-opus-4-8')).toBeCloseTo(0.5)

    // Mixed, opus: 100k in, 20k out, 400k cache-read, 10k cache-write.
    // (100000*5 + 20000*25 + 400000*0.5 + 10000*6.25) / 1e6 = 1.2625
    const mixed = usage({ inputTokens: 100_000, outputTokens: 20_000, cacheReadTokens: 400_000, cacheCreationTokens: 10_000 })
    expect(equivApiValue(mixed, 'claude-opus-4-8')).toBeCloseTo(1.2625)
  })
})
