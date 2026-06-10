import type { Account, RateLimit } from '@shared/types'
import { formatResetCountdown } from '@shared/format'
import { barFill } from './meta'
import { Bar } from './atoms'

function Window({ label, limit, now, compact }: { label: string; limit: RateLimit; now: number; compact: boolean }) {
  // Clamp the label too, not just the bar: the statusLine can over-report past a limit, and a "150%"
  // next to a full bar reads as a glitch (the rate-limit bars use a brighter 90 threshold than context).
  const pct = Math.min(100, Math.max(0, Math.round(limit.usedPct)))
  const countdown = formatResetCountdown(limit.resetsAt, now)
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5" title={`${label} limit · ${pct}% used · resets ${countdown}`}>
        <span className="text-[10px] uppercase tracking-wider text-fg-faint">{label}</span>
        <Bar pct={pct} fill={barFill(pct, 90)} className="w-10" />
        <span className="font-mono text-[10px] tabular-nums text-fg-muted">{pct}%</span>
      </span>
    )
  }
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] text-fg">{label}</span>
        <span className="font-mono text-[10px] tabular-nums text-fg-muted">{pct}% · resets {countdown}</span>
      </div>
      <Bar pct={pct} fill={barFill(pct, 90)} className="w-full" />
    </div>
  )
}

/**
 * The 5-hour and 7-day account rate-limit bars. Renders nothing unless the account is a subscription
 * with at least one window present — an API account (or no account) has no limits to show, which is
 * ADR-0001's graceful degradation. `now` comes from the parent's render clock so countdowns tick with
 * the 3s background re-sync. `variant` is 'rail' (stacked, full width) or 'compact' (inline, header).
 */
export function RateLimits({ account, now, variant }: { account: Account | null; now: number; variant: 'rail' | 'compact' }) {
  if (!account || account.billingMode !== 'subscription') return null
  const { fiveHour, sevenDay } = account
  if (!fiveHour && !sevenDay) return null
  const compact = variant === 'compact'

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {fiveHour && <Window label="5h" limit={fiveHour} now={now} compact />}
        {sevenDay && <Window label="7d" limit={sevenDay} now={now} compact />}
      </div>
    )
  }
  return (
    <div className="space-y-2 border-b border-ink-800 pb-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Rate limits</div>
      {fiveHour && <Window label="5-hour" limit={fiveHour} now={now} compact={false} />}
      {sevenDay && <Window label="7-day" limit={sevenDay} now={now} compact={false} />}
    </div>
  )
}
