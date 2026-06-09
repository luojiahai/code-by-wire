import { describe, it, expect } from 'vitest'
import { formatUsd, formatRelativeTime } from '@shared/format'

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
