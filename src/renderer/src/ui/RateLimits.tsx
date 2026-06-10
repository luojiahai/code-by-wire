import type { Account, RateLimit } from '@shared/types'
import { formatResetCountdown } from '@shared/format'
import { barFill } from './meta'
import { Bar } from './atoms'

function Window({ label, limit, now }: { label: string; limit: RateLimit; now: number }) {
  // Clamp the label too, not just the bar: the statusLine can over-report past a limit, and a "150%"
  // next to a full bar reads as a glitch (the rate-limit bars use a brighter 90 threshold than context).
  const pct = Math.min(100, Math.max(0, Math.round(limit.usedPct)))
  const countdown = formatResetCountdown(limit.resetsAt, now)
  // Inline form for the header: bar + percent, with the reset countdown in the tooltip to stay compact.
  return (
    <span className="inline-flex items-center gap-1.5" title={`${label} limit · ${pct}% used · resets ${countdown}`}>
      <span className="text-[10px] uppercase tracking-wider text-fg-faint">{label}</span>
      <Bar pct={pct} fill={barFill(pct, 90)} className="w-10" />
      <span className="font-mono text-[10px] tabular-nums text-fg-muted">{pct}%</span>
    </span>
  )
}

/**
 * The 5-hour and 7-day account rate-limit bars, inline for the header. Renders nothing unless the
 * account is a subscription with at least one window present — an API account (or no account) has no
 * limits to show, which is ADR-0001's graceful degradation. `now` comes from the parent's render clock
 * so countdowns tick with the 3s background re-sync.
 */
export function RateLimits({ account, now }: { account: Account | null; now: number }) {
  if (!account || account.billingMode !== 'subscription') return null
  const { fiveHour, sevenDay } = account
  if (!fiveHour && !sevenDay) return null
  return (
    <div className="flex items-center gap-3">
      {fiveHour && <Window label="5h" limit={fiveHour} now={now} />}
      {sevenDay && <Window label="7d" limit={sevenDay} now={now} />}
    </div>
  )
}
