import type { Account, RateLimit } from '@shared/types'
import { formatResetCountdown } from '@shared/format'
import { clampPct } from './charts-geom'

/** One rate-limit row in the rail account block: a label, a clamped percent, and a reset countdown
 *  line (null for the per-model rows, which only carry a percent). */
export interface RailGauge {
  label: string
  pct: number
  reset: string | null
}

/** The resolved view for the rail's account block. */
export interface RailAccountView {
  email: string | null
  plan: string
  gauges: RailGauge[]
}

function planLabel(billingMode: Account['billingMode']): string {
  if (billingMode === 'subscription') return 'Claude · subscription'
  if (billingMode === 'api') return 'Claude · API'
  return 'Claude'
}

function gauge(label: string, limit: RateLimit, now: number, withReset: boolean): RailGauge {
  return {
    label,
    pct: clampPct(Math.round(limit.usedPct)),
    reset: withReset ? `resets in ${formatResetCountdown(limit.resetsAt, now)}` : null,
  }
}

/**
 * Resolve what the rail's account block should show. Returns null when there's nothing worth a block
 * — no account, or an account with neither an email nor any rate-limit window (ADR-0001 graceful
 * degradation). The 5h and weekly windows carry a reset countdown; the per-model weekly buckets
 * (usually absent — the CLI only emits them on some accounts) append as percent-only rows.
 */
export function railAccountModel(account: Account | null, now: number): RailAccountView | null {
  if (!account) return null
  const gauges: RailGauge[] = []
  // Rate-limit windows are a subscription-only signal (ADR-0001): only a subscription capture carries
  // them. Gate the gauges on billingMode rather than field presence, so a non-subscription account that
  // somehow surfaced a window can't render subscription-only bars — the guard RateLimits/AccountPopover
  // enforced before this view-model existed.
  if (account.billingMode === 'subscription') {
    if (account.fiveHour) gauges.push(gauge('5h', account.fiveHour, now, true))
    if (account.sevenDay) gauges.push(gauge('Weekly', account.sevenDay, now, true))
    if (account.sevenDaySonnet) gauges.push(gauge('Sonnet', account.sevenDaySonnet, now, false))
    if (account.sevenDayOpus) gauges.push(gauge('Opus', account.sevenDayOpus, now, false))
  }
  if (!account.email && gauges.length === 0) return null
  return { email: account.email ?? null, plan: planLabel(account.billingMode), gauges }
}
