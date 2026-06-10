import { describe, it, expect } from 'vitest'
import { deriveAccount, type StatusLineSample } from '@shared/statusline'

const T = 1_781_000_000_000

function sample(over: Partial<StatusLineSample> = {}): StatusLineSample {
  return {
    sessionId: 's1',
    capturedMtimeMs: T,
    costUsd: null,
    linesAdded: null,
    linesRemoved: null,
    contextPct: null,
    contextWindow: null,
    liveContext: null,
    modelId: null,
    modelDisplayName: null,
    sessionName: null,
    version: null,
    effortLevel: null,
    cwd: null,
    sessionClockMs: null,
    rateLimits: null,
    ...over,
  }
}

describe('deriveAccount — version + weekly sub-buckets', () => {
  it('carries version from the freshest sample and the sonnet/opus buckets from the limits sample', () => {
    const s = sample({
      version: '2.0.14',
      rateLimits: {
        fiveHour: { usedPct: 41, resetsAt: T + 8_280_000 },
        sevenDay: { usedPct: 68, resetsAt: T + 273_600_000 },
        sevenDaySonnet: { usedPct: 52, resetsAt: T + 273_600_000 },
        sevenDayOpus: { usedPct: 81, resetsAt: T + 273_600_000 },
      },
    })
    const acc = deriveAccount([s], T, 7 * 24 * 60 * 60 * 1000)
    expect(acc?.billingMode).toBe('subscription')
    expect(acc?.version).toBe('2.0.14')
    expect(acc?.sevenDaySonnet?.usedPct).toBe(52)
    expect(acc?.sevenDayOpus?.usedPct).toBe(81)
  })

  it('drops a sub-bucket whose reset has already passed', () => {
    const s = sample({
      rateLimits: {
        sevenDay: { usedPct: 68, resetsAt: T + 1000 },
        sevenDayOpus: { usedPct: 81, resetsAt: T - 1000 }, // already reset
      },
    })
    const acc = deriveAccount([s], T, 7 * 24 * 60 * 60 * 1000)
    expect(acc?.sevenDayOpus).toBeUndefined()
  })
})
