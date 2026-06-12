import { describe, expect, it } from 'vitest'
import { railAccountModel } from '../../src/renderer/src/ui/rail-account'
import type { Account } from '@shared/types'

// Fixed clock; resets are expressed as offsets from it so the countdown strings are deterministic.
const NOW = 1_700_000_000_000
const in2h14m = NOW + (2 * 60 + 14) * 60_000
const in5d = NOW + 5 * 24 * 60 * 60_000

describe('railAccountModel', () => {
  it('returns null when there is no account', () => {
    expect(railAccountModel(null, NOW)).toBeNull()
  })

  it('returns null when there is no email and no rate-limit windows', () => {
    const acc: Account = { billingMode: 'unknown' }
    expect(railAccountModel(acc, NOW)).toBeNull()
  })

  it('builds identity, plan label and 5h + weekly gauges for a subscription', () => {
    const acc: Account = {
      billingMode: 'subscription',
      email: 'a@b.com',
      fiveHour: { usedPct: 42, resetsAt: in2h14m },
      sevenDay: { usedPct: 18, resetsAt: in5d },
    }
    const view = railAccountModel(acc, NOW)
    expect(view).not.toBeNull()
    expect(view!.email).toBe('a@b.com')
    expect(view!.plan).toBe('Claude · subscription')
    expect(view!.gauges).toEqual([
      { label: '5h', pct: 42, reset: 'resets in 2h 14m' },
      { label: 'Weekly', pct: 18, reset: 'resets in 5d' },
    ])
  })

  it('returns null for a non-subscription account — the block is subscription-only, no identity to show', () => {
    const acc: Account = { billingMode: 'api', email: 'a@b.com' }
    expect(railAccountModel(acc, NOW)).toBeNull()
  })

  it('suppresses the whole block for a non-subscription account even if a stale email/windows are present', () => {
    // The Portkey/gateway case: billing is 'unknown' (no rate_limits captured), but a prior subscription
    // login left an oauthAccount email in .claude.json. Identity and windows are both subscription-only
    // (ADR-0001), so neither shows — the account block disappears rather than mislabel gateway billing.
    const acc: Account = {
      billingMode: 'unknown',
      email: 'a@b.com',
      fiveHour: { usedPct: 42, resetsAt: in2h14m },
      sevenDay: { usedPct: 18, resetsAt: in5d },
    }
    expect(railAccountModel(acc, NOW)).toBeNull()
  })

  it('appends Sonnet/Opus rows (percent only, no reset) when present', () => {
    const acc: Account = {
      billingMode: 'subscription',
      email: 'a@b.com',
      fiveHour: { usedPct: 42, resetsAt: in2h14m },
      sevenDay: { usedPct: 18, resetsAt: in5d },
      sevenDaySonnet: { usedPct: 22, resetsAt: in5d },
      sevenDayOpus: { usedPct: 61, resetsAt: in5d },
    }
    const view = railAccountModel(acc, NOW)
    expect(view!.gauges.map((g) => g.label)).toEqual(['5h', 'Weekly', 'Sonnet', 'Opus'])
    expect(view!.gauges[2]).toEqual({ label: 'Sonnet', pct: 22, reset: null })
    expect(view!.gauges[3]).toEqual({ label: 'Opus', pct: 61, reset: null })
  })

  it('shows usage with no email (email null, gauges present)', () => {
    const acc: Account = { billingMode: 'subscription', sevenDay: { usedPct: 5, resetsAt: in5d } }
    const view = railAccountModel(acc, NOW)
    expect(view!.email).toBeNull()
    expect(view!.gauges.map((g) => g.label)).toEqual(['Weekly'])
  })

  it('clamps and rounds the percent', () => {
    const acc: Account = {
      billingMode: 'subscription',
      email: 'a@b.com',
      fiveHour: { usedPct: 149.6, resetsAt: in2h14m },
      sevenDay: { usedPct: -3, resetsAt: in5d },
    }
    const view = railAccountModel(acc, NOW)
    expect(view!.gauges[0].pct).toBe(100)
    expect(view!.gauges[1].pct).toBe(0)
  })
})
