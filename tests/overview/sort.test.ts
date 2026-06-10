import { describe, it, expect } from 'vitest'
import { sortSessions } from '@shared/overview'
import type { Session } from '@shared/types'

/** A Session with sensible defaults; override only the fields a case cares about. */
function s(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    title: id,
    project: 'p',
    state: 'idle',
    management: 'observed',
    model: 'claude-opus-4-8',
    contextPct: 0,
    contextWindow: 200_000,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    equivApiValueUsd: 0,
    lastActivityMs: 0,
    tasks: [],
    subagents: [],
    ...over,
  }
}

describe('sortSessions', () => {
  it('sorts by context % descending', () => {
    const out = sortSessions([s('a', { contextPct: 10 }), s('b', { contextPct: 90 }), s('c', { contextPct: 50 })], 'ctx')
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by equivalent value descending', () => {
    const out = sortSessions([s('a', { equivApiValueUsd: 1 }), s('b', { equivApiValueUsd: 9 }), s('c', { equivApiValueUsd: 3 })], 'value')
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by last activity descending', () => {
    const out = sortSessions([s('a', { lastActivityMs: 100 }), s('b', { lastActivityMs: 300 }), s('c', { lastActivityMs: 200 })], 'last')
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('default order groups by state (Waiting first), then most recent', () => {
    const out = sortSessions(
      [
        s('a', { state: 'idle', lastActivityMs: 5 }),
        s('b', { state: 'waiting', lastActivityMs: 1 }),
        s('c', { state: 'working', lastActivityMs: 9 }),
        s('d', { state: 'waiting', lastActivityMs: 8 }),
      ],
      'default',
    )
    expect(out.map((x) => x.id)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('does not mutate its input', () => {
    const input = [s('a', { contextPct: 1 }), s('b', { contextPct: 9 })]
    sortSessions(input, 'ctx')
    expect(input.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('is stable: equal keys keep their incoming order', () => {
    const out = sortSessions([s('a', { contextPct: 5 }), s('b', { contextPct: 5 }), s('c', { contextPct: 5 })], 'ctx')
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps Waiting pinned on top regardless of the active sort', () => {
    // Value sort alone would scatter Waiting; sortSessions keeps them pinned, in value order.
    const xs = [
      s('a', { state: 'working', equivApiValueUsd: 9 }),
      s('b', { state: 'waiting', equivApiValueUsd: 2 }),
      s('c', { state: 'idle', equivApiValueUsd: 7 }),
      s('d', { state: 'waiting', equivApiValueUsd: 5 }),
    ]
    const out = sortSessions(xs, 'value')
    expect(out.map((x) => x.id)).toEqual(['d', 'b', 'a', 'c'])
  })
})

describe('sortSessions value — uses the displayed figure (live cost over computed)', () => {
  it('orders by liveCostUsd when present, falling back to equivApiValueUsd', () => {
    // A has a small computed value but a large LIVE cost; B the reverse. The displayed (live-preferred)
    // figure should drive the order, so A sorts above B.
    const a = s('a', { equivApiValueUsd: 1, liveCostUsd: 99 })
    const b = s('b', { equivApiValueUsd: 50, liveCostUsd: undefined })
    expect(sortSessions([b, a], 'value').map((x) => x.id)).toEqual(['a', 'b'])
  })
})
