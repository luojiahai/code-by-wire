import { useState } from 'react'
import type { Account } from '@shared/types'
import { Wordmark } from './atoms'
import { Icon } from './icons'
import { RateLimits } from './RateLimits'
import { AccountPopover } from './AccountPopover'

/**
 * The fixed top app bar for the master/detail shell: wordmark + session count + account rate-limit
 * gauges on the left (the info group shrinks/clips), Refresh + New session pinned right. `now` is a
 * fresh render clock so the rate-limit countdowns tick with App's 3s background re-sync.
 */
export function GlobalHeader({
  sessionCount,
  account,
  loading,
  onRefresh,
  onNew,
}: {
  sessionCount: number
  account: Account | null
  loading: boolean
  onRefresh: () => void
  onNew: () => void
}) {
  const now = Date.now()
  const [accountOpen, setAccountOpen] = useState(false)
  return (
    <header className="flex shrink-0 items-center gap-3.5 overflow-hidden border-b border-ink-800 bg-ink-925 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-3.5 overflow-hidden">
        <Wordmark />
        <span className="shrink-0 rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-fg-muted ring-1 ring-ink-800">
          {sessionCount} session{sessionCount === 1 ? '' : 's'}
        </span>
        <span className="h-5 w-px shrink-0 bg-ink-800" />
        <RateLimits account={account} now={now} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {account?.email && (
          <button
            onClick={() => setAccountOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md border border-ink-700 bg-ink-900 py-1 pl-1.5 pr-2 text-fg transition-colors hover:bg-ink-750"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-deep text-[10px] font-bold text-ink-950">
              {account.email.charAt(0).toUpperCase()}
            </span>
            <span className="max-w-[150px] truncate text-[12px] text-fg-muted">{account.email}</span>
            <span className="text-[10px] text-fg-faint">▾</span>
          </button>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-900 px-3 py-1.5 text-[13px] text-fg transition-colors hover:bg-ink-750 disabled:cursor-default disabled:opacity-50"
        >
          <Icon name="refresh-cw" size={14} />
          {loading ? 'Syncing…' : 'Refresh'}
        </button>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-ink-950 ring-1 ring-primary/40 transition-colors hover:bg-primary-bright"
        >
          <Icon name="plus" size={14} />
          New session
        </button>
      </div>
      {accountOpen && account && <AccountPopover account={account} now={now} onClose={() => setAccountOpen(false)} />}
    </header>
  )
}
