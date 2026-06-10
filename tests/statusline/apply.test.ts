import { describe, it, expect } from 'vitest'
import type { Session } from '@shared/types'
import {
  freshestBySession,
  deriveAccount,
  overlaySessions,
  type StatusLineSample,
} from '@shared/statusline'

const NOW = 1_781_000_000_000
const STALE_MS = 7 * 24 * 60 * 60 * 1000

const sample = (over: Partial<StatusLineSample> = {}): StatusLineSample => ({
  sessionId: 's1',
  capturedMtimeMs: NOW,
  costUsd: null,
  linesAdded: null,
  linesRemoved: null,
  contextPct: null,
  contextWindow: null,
  rateLimits: null,
  ...over,
})

const session = (over: Partial<Session> = {}): Session => ({
  id: 's1',
  title: 'T',
  project: 'p',
  state: 'working',
  management: 'observed',
  model: 'claude-opus-4-8',
  contextPct: 12,
  contextWindow: 1_000_000,
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  equivApiValueUsd: 3.5,
  lastActivityMs: NOW,
  tasks: [],
  subagents: [],
  ...over,
})

describe('deriveAccount', () => {
  it('reads a subscription from a sample carrying rate_limits, converting nothing further (already ms)', () => {
    const s = sample({
      rateLimits: { fiveHour: { usedPct: 23.5, resetsAt: NOW + 3_600_000 }, sevenDay: { usedPct: 41, resetsAt: NOW + 86_400_000 } },
    })
    expect(deriveAccount([s], NOW, STALE_MS)).toEqual({
      billingMode: 'subscription',
      fiveHour: { usedPct: 23.5, resetsAt: NOW + 3_600_000 },
      sevenDay: { usedPct: 41, resetsAt: NOW + 86_400_000 },
    })
  })

  it('reads an API account from a sample with no rate_limits (no bars)', () => {
    expect(deriveAccount([sample({ rateLimits: null })], NOW, STALE_MS)).toEqual({ billingMode: 'api' })
  })

  it('returns null when there is no statusLine data at all', () => {
    expect(deriveAccount([], NOW, STALE_MS)).toBeNull()
  })

  it('ignores a stale capture older than the window — a week-old sample cannot describe a 5h/7d limit', () => {
    const old = sample({ capturedMtimeMs: NOW - STALE_MS - 1, rateLimits: { fiveHour: { usedPct: 9, resetsAt: NOW } } })
    expect(deriveAccount([old], NOW, STALE_MS)).toBeNull()
  })

  it('picks the freshest sample when several disagree', () => {
    const stale = sample({ sessionId: 'a', capturedMtimeMs: NOW - 10_000, rateLimits: null })
    const fresh = sample({ sessionId: 'b', capturedMtimeMs: NOW, rateLimits: { fiveHour: { usedPct: 50, resetsAt: NOW + 1000 } } })
    expect(deriveAccount([stale, fresh], NOW, STALE_MS)?.billingMode).toBe('subscription')
  })

  it('prefers the freshest capture carrying rate_limits, so a newer no-limits capture does not flip to api', () => {
    // A subscription session that hasn't had its first API response yet (no rate_limits) writes the
    // newest capture, while an older session still carries the windows. The account must stay subscription.
    const older = sample({ sessionId: 'a', capturedMtimeMs: NOW - 1000, rateLimits: { fiveHour: { usedPct: 30, resetsAt: NOW + 3_600_000 } } })
    const newer = sample({ sessionId: 'b', capturedMtimeMs: NOW, rateLimits: null })
    expect(deriveAccount([newer, older], NOW, STALE_MS)).toEqual({
      billingMode: 'subscription',
      fiveHour: { usedPct: 30, resetsAt: NOW + 3_600_000 },
      sevenDay: undefined,
    })
  })

  it('drops a rate-limit window whose reset has already passed (no stale "% used · resets now")', () => {
    const s = sample({
      rateLimits: { fiveHour: { usedPct: 80, resetsAt: NOW - 1 }, sevenDay: { usedPct: 40, resetsAt: NOW + 86_400_000 } },
    })
    expect(deriveAccount([s], NOW, STALE_MS)).toEqual({
      billingMode: 'subscription',
      fiveHour: undefined, // already reset → not shown stale
      sevenDay: { usedPct: 40, resetsAt: NOW + 86_400_000 },
    })
  })
})

describe('overlaySessions', () => {
  it('overlays live cost, lines, and context onto a Session that has a sample', () => {
    const byId = freshestBySession([
      sample({ sessionId: 's1', costUsd: 0.42, linesAdded: 156, linesRemoved: 23, contextPct: 64, contextWindow: 200_000 }),
    ])
    const [out] = overlaySessions([session()], byId)
    expect(out.liveCostUsd).toBe(0.42)
    expect(out.linesAdded).toBe(156)
    expect(out.linesRemoved).toBe(23)
    expect(out.contextPct).toBe(64)
    expect(out.contextWindow).toBe(200_000)
  })

  it('leaves a Session WITHOUT a sample untouched — computed context % and value still show (graceful degradation, ADR-0001)', () => {
    const out = overlaySessions([session({ id: 'no-sample' })], freshestBySession([sample({ sessionId: 'other' })]))
    expect(out[0].contextPct).toBe(12) // computed, unchanged
    expect(out[0].equivApiValueUsd).toBe(3.5) // computed, unchanged
    expect(out[0].liveCostUsd).toBeUndefined()
    expect(out[0].linesAdded).toBeUndefined()
  })

  it('falls back to the computed context % when the sample omitted used_percentage', () => {
    const byId = freshestBySession([sample({ sessionId: 's1', contextPct: null, costUsd: 1 })])
    expect(overlaySessions([session({ contextPct: 12 })], byId)[0].contextPct).toBe(12)
  })

  it('keeps a zero live cost (0 is a real value, not "missing")', () => {
    const byId = freshestBySession([sample({ sessionId: 's1', costUsd: 0 })])
    expect(overlaySessions([session()], byId)[0].liveCostUsd).toBe(0)
  })
})

describe('freshestBySession', () => {
  it('keeps the newest capture per session id', () => {
    const a = sample({ sessionId: 's1', capturedMtimeMs: 100, costUsd: 1 })
    const b = sample({ sessionId: 's1', capturedMtimeMs: 200, costUsd: 2 })
    expect(freshestBySession([a, b]).get('s1')?.costUsd).toBe(2)
  })

  it('keeps every distinct session id', () => {
    const map = freshestBySession([sample({ sessionId: 'a' }), sample({ sessionId: 'b' })])
    expect([...map.keys()].sort()).toEqual(['a', 'b'])
  })
})
