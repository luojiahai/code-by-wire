import { describe, it, expect } from 'vitest'
import { formatUsd, formatRelativeTime, formatResetCountdown, costDisplay, formatTokens, formatDuration } from '@shared/format'

describe('formatUsd', () => {
  it('uses 2 decimals under $10, 1 under $100, none above', () => {
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(0.3025)).toBe('$0.30')
    expect(formatUsd(6.42)).toBe('$6.42')
    expect(formatUsd(42)).toBe('$42.0')
    expect(formatUsd(142.7)).toBe('$143')
  })
})

describe('formatRelativeTime', () => {
  const now = 1_000_000_000

  it('renders coarse buckets from seconds to days', () => {
    expect(formatRelativeTime(now - 2_000, now)).toBe('now') // 2s
    expect(formatRelativeTime(now - 45_000, now)).toBe('45s ago')
    expect(formatRelativeTime(now - 600_000, now)).toBe('10m ago')
    expect(formatRelativeTime(now - 7_200_000, now)).toBe('2h ago')
    expect(formatRelativeTime(now - 172_800_000, now)).toBe('2d ago')
  })

  it('never goes negative for a future timestamp', () => {
    expect(formatRelativeTime(now + 5_000, now)).toBe('now')
  })
})

describe('formatResetCountdown', () => {
  const now = 1_781_000_000_000

  it('pieces the largest two units and stays short', () => {
    expect(formatResetCountdown(now + 2 * 3_600_000 + 14 * 60_000, now)).toBe('2h 14m')
    expect(formatResetCountdown(now + 2 * 3_600_000, now)).toBe('2h') // exactly on the hour, no trailing 0m
    expect(formatResetCountdown(now + 3 * 86_400_000 + 4 * 3_600_000, now)).toBe('3d 4h')
    expect(formatResetCountdown(now + 90 * 60_000, now)).toBe('1h 30m')
    expect(formatResetCountdown(now + 30 * 60_000, now)).toBe('30m')
    expect(formatResetCountdown(now + 86_400_000, now)).toBe('1d') // exactly a day, no trailing 0h
  })

  it('collapses under a minute and never goes negative', () => {
    expect(formatResetCountdown(now + 45_000, now)).toBe('<1m')
    expect(formatResetCountdown(now - 5_000, now)).toBe('now')
    expect(formatResetCountdown(now, now)).toBe('now')
  })
})

describe('costDisplay', () => {
  it('labels an API account as real spend (no tilde)', () => {
    expect(costDisplay({ liveCostUsd: 0.5, equivApiValueUsd: 9, billingMode: 'api' })).toEqual({
      text: '$0.50',
      equivalent: false,
    })
  })

  it('labels a subscription as an equivalent value (tilde)', () => {
    expect(costDisplay({ liveCostUsd: 0.5, equivApiValueUsd: 9, billingMode: 'subscription' })).toEqual({
      text: '~$0.50',
      equivalent: true,
    })
  })

  it('prefers live cost over the computed value when present', () => {
    expect(costDisplay({ liveCostUsd: 2, equivApiValueUsd: 9, billingMode: 'subscription' }).text).toBe('~$2.00')
  })

  it('falls back to the computed equivalent value, framed as equivalent, when there is no account', () => {
    expect(costDisplay({ equivApiValueUsd: 6.42 })).toEqual({ text: '~$6.42', equivalent: true })
  })

  it('frames the computed fallback as an estimate even on an API account (no live sample to call spend)', () => {
    // Without Claude's own live figure, the computed equivApiValueUsd is an estimate — it must not be
    // labeled exact API spend just because the account bills per call.
    expect(costDisplay({ equivApiValueUsd: 6.42, billingMode: 'api' })).toEqual({ text: '~$6.42', equivalent: true })
  })

  it('frames an unknown account as equivalent (~), like a subscription', () => {
    expect(costDisplay({ liveCostUsd: 0.5, equivApiValueUsd: 9, billingMode: 'unknown' })).toEqual({ text: '~$0.50', equivalent: true })
  })
})

describe('formatTokens', () => {
  it('groups with thousands separators and floors junk at 0', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(980)).toBe('980')
    expect(formatTokens(80_710)).toBe('80,710')
    expect(formatTokens(1_000_000)).toBe('1,000,000')
    expect(formatTokens(-5)).toBe('0')
    expect(formatTokens(NaN)).toBe('0')
  })
})

describe('formatDuration', () => {
  it('counts up from zero, largest two units, sub-second as tenths', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(400)).toBe('0.4s')
    expect(formatDuration(12_000)).toBe('12s')
    expect(formatDuration(60_000)).toBe('1m')
    expect(formatDuration(200_000)).toBe('3m 20s')
    expect(formatDuration(3_600_000)).toBe('1h')
    expect(formatDuration(3_840_000)).toBe('1h 4m')
  })
})
