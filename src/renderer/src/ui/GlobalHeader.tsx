import type { Account } from '@shared/types'
import { Wordmark } from './atoms'
import { Icon } from './icons'
import { RateLimits } from './RateLimits'

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
    </header>
  )
}
