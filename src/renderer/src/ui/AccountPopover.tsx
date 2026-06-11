import type { Account, RateLimit } from '@shared/types'
import { formatResetCountdown } from '@shared/format'
import { barFill } from './meta'
import { Bar } from './atoms'
import { MetricRow } from '../workspace/panels/MetricRow'

function LimitBar({ label, limit, now }: { label: string; limit: RateLimit; now: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(limit.usedPct)))
  return (
    <div className="pt-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-fg-muted">{label}</span>
        <span className="font-mono text-[12px] tabular-nums text-fg">{pct}%</span>
      </div>
      <Bar pct={pct} fill={barFill(pct, 90)} className="mt-1.5 w-full" />
      <div className="mt-1 text-right font-mono text-[10px] text-fg-faint">resets in {formatResetCountdown(limit.resetsAt, now)}</div>
    </div>
  )
}

/** The global/account overview, dropped from the header account chip. Subscription-only data (usage
 *  bars) hides on a non-subscription account. `now` ticks the reset countdowns via App's render clock. */
export function AccountPopover({ account, now, onClose }: { account: Account; now: number; onClose: () => void }) {
  const sub = account.billingMode === 'subscription'
  return (
    <>
      {/* click-away scrim */}
      <div className="fixed inset-0 z-[900]" onClick={onClose} />
      <div className="fixed right-4 top-[52px] z-[1000] w-[330px] overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-ink-800 px-3.5 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-deep text-[13px] font-bold text-ink-950">
            {(account.email ?? '?').charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] text-fg">{account.email ?? 'Unknown account'}</div>
            <div className="text-[11px] text-fg-faint">Claude · {account.billingMode}</div>
          </div>
          {account.version && (
            <span className="ml-auto rounded bg-ink-925 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted ring-1 ring-ink-800">
              v{account.version}
            </span>
          )}
        </div>
        {sub && (account.fiveHour || account.sevenDay) && (
          <div className="px-3.5 py-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Usage limits</h3>
            {account.fiveHour && <LimitBar label="5-hour" limit={account.fiveHour} now={now} />}
            {account.sevenDay && <LimitBar label="Weekly" limit={account.sevenDay} now={now} />}
          </div>
        )}
        {sub && (account.sevenDaySonnet || account.sevenDayOpus) && (
          <div className="border-t border-ink-800 px-3.5 py-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Weekly by model</h3>
            {account.sevenDaySonnet && (
              <div className="pt-1.5">
                <MetricRow label="Sonnet" value={`${Math.round(account.sevenDaySonnet.usedPct)}%`} />
                <Bar pct={account.sevenDaySonnet.usedPct} fill={barFill(account.sevenDaySonnet.usedPct, 90)} className="mt-1.5 w-full" />
              </div>
            )}
            {account.sevenDayOpus && (
              <div className="pt-2">
                <MetricRow label="Opus" value={`${Math.round(account.sevenDayOpus.usedPct)}%`} tone="text-accent-bright" />
                <Bar pct={account.sevenDayOpus.usedPct} fill={barFill(account.sevenDayOpus.usedPct, 90)} className="mt-1.5 w-full" />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
