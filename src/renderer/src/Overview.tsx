import { useMemo, useState, type ReactNode } from 'react'
import type { Session, ProviderCapabilities, Account } from '@shared/types'
import type { Stats } from '@shared/stats'
import { sortSessions, filterSessions, stateCounts, ORDERED_STATES, type SortKey, type Filter } from '@shared/overview'
import { formatUsd, formatRelativeTime, costDisplay } from '@shared/format'
import { STATE_META, MODEL_LABEL, ctxTone, ctxBar } from './ui/meta'
import { cx, Dot, ManagementChip, ModelChip, Bar } from './ui/atoms'
import { RateLimits } from './ui/RateLimits'

/** Projects shown in the rail rollup before collapsing the rest into a "+N more" row. */
const TOP_PROJECTS = 8

/** Filter chips, in display order: 'all', then the states loudest-first (from ORDERED_STATES). */
const FILTERS: Filter[] = ['all', ...ORDERED_STATES]

interface Props {
  sessions: Session[]
  caps: ProviderCapabilities | null
  stats: Stats | null
  account: Account | null
  loading: boolean
  onRefresh: () => void
  onOpen: (session: Session) => void
  onNew: () => void
}

export function Overview({ sessions, caps, stats, account, loading, onRefresh, onOpen, onNew }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<SortKey>('default')
  // One timestamp per render for every relative-time label; the 3s background re-sync re-renders and
  // refreshes it, so sub-second drift never shows.
  const now = Date.now()

  const counts = useMemo(() => stateCounts(sessions), [sessions])
  // Table pipeline: filter by the active chip, then sort by the active column. sortSessions pins
  // Waiting on top in the same pass, so those rows are never buried, even mid-sort.
  const rows = useMemo(
    () => sortSessions(filterSessions(sessions, filter), sort),
    [sessions, filter, sort],
  )

  return (
    <div className="app-bg flex h-screen flex-col text-fg">
      <header className="flex shrink-0 items-center gap-4 border-b border-ink-800 px-5 py-3">
        <h1 className="text-base font-semibold">code-by-wire</h1>
        <span className="text-[13px] text-fg-muted">
          {sessions.length} session{sessions.length === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onNew}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-ink-950 transition-colors hover:bg-primary-bright"
          >
            ＋ New session
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="rounded-md border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-fg transition-colors hover:bg-ink-750 disabled:cursor-default disabled:opacity-60"
          >
            {loading ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Rail stats={stats} caps={caps} account={account} now={now} />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-ink-800 px-5 py-3">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cx(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs capitalize transition-colors',
                  filter === f ? 'bg-ink-750 text-fg' : 'text-fg-muted hover:bg-ink-850',
                )}
              >
                {f !== 'all' && <Dot state={f} />}
                {f}
                <span className="font-mono text-[10px] text-fg-faint">{counts[f]}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {sessions.length === 0 ? (
              // Stay blank while the first sync is in flight; only call it empty once it has finished.
              loading ? null : <p className="px-5 py-6 text-sm text-fg-muted">No Claude Code sessions found.</p>
            ) : rows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-fg-muted">No {filter} sessions.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-ink-925 text-left">
                  <tr className="text-[10px] uppercase tracking-wider text-fg-faint">
                    <Th>State</Th>
                    <Th>Session</Th>
                    <Th>Model</Th>
                    <Th sortable sortKey="ctx" active={sort === 'ctx'} onSort={setSort}>Context</Th>
                    <Th sortable sortKey="value" active={sort === 'value'} onSort={setSort} right>~Value</Th>
                    <Th sortable sortKey="last" active={sort === 'last'} onSort={setSort} right>Last</Th>
                    <Th right title="Lines added / removed this session (from the statusLine)">Lines</Th>
                    <Th>Activity</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const isWaiting = s.state === 'waiting'
                    const projectLine = s.branch ? `${s.project} · ${s.branch}` : s.project
                    const activity = isWaiting ? `⚠ ${s.waitingReason ?? 'Waiting on you'}` : (s.currentTask ?? '')
                    const cost = costDisplay({ liveCostUsd: s.liveCostUsd, equivApiValueUsd: s.equivApiValueUsd, billingMode: account?.billingMode })
                    return (
                      <tr
                        key={s.id}
                        className={cx('row-clickable border-b border-ink-800/70', isWaiting && 'bg-accent/[0.06]')}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open ${s.title}`}
                        onClick={() => onOpen(s)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onOpen(s)
                          }
                        }}
                      >
                        <td className={cx('py-2.5 pl-5 pr-3', isWaiting && 'border-l-2 border-accent')}>
                          <span className={cx('inline-flex items-center gap-1.5 text-[11px]', STATE_META[s.state].text)}>
                            <Dot state={s.state} />
                            {STATE_META[s.state].label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex max-w-[340px] items-center gap-2">
                            <ManagementChip kind={s.management} />
                            <span className="min-w-0 truncate text-[13px] text-fg" title={s.title}>{s.title}</span>
                          </div>
                          <div className="max-w-[340px] truncate font-mono text-[10px] text-fg-faint" title={projectLine}>
                            {projectLine}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3"><ModelChip model={s.model} /></td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <Bar pct={s.contextPct} fill={ctxBar(s.contextPct)} className="w-16" />
                            <span className={cx('font-mono text-[11px] tabular-nums', ctxTone(s.contextPct))}>{s.contextPct}%</span>
                          </div>
                        </td>
                        <td
                          className="py-2.5 pr-3 text-right font-mono text-[11px] tabular-nums text-fg-muted"
                          title={cost.equivalent ? 'Equivalent API value (estimate)' : 'Actual API spend'}
                        >
                          {cost.text}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-[11px] tabular-nums text-fg-faint">{formatRelativeTime(s.lastActivityMs, now)}</td>
                        <td className="py-2.5 pr-3 text-right font-mono text-[11px] tabular-nums text-fg-faint">
                          {s.linesAdded != null || s.linesRemoved != null ? (
                            <span title={`+${s.linesAdded ?? 0} / −${s.linesRemoved ?? 0} lines`}>
                              <span className="text-primary-bright">+{s.linesAdded ?? 0}</span>{' '}
                              <span className="text-accent-bright">−{s.linesRemoved ?? 0}</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 pr-5">
                          <span
                            className={cx('block max-w-[260px] truncate text-[11px]', isWaiting ? 'text-accent-bright' : 'text-fg-muted')}
                            title={activity}
                          >
                            {activity}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

/** A table header cell; sortable ones render a button that toggles to their column and show a ▼/⇅ glyph. */
function Th({
  children,
  sortable,
  sortKey,
  active,
  onSort,
  right,
  title,
}: {
  children: ReactNode
  sortable?: boolean
  sortKey?: SortKey
  active?: boolean
  onSort?: (k: SortKey) => void
  right?: boolean
  title?: string
}) {
  return (
    <th
      title={title}
      aria-sort={sortable ? (active ? 'descending' : 'none') : undefined}
      className={cx('whitespace-nowrap px-3 py-2.5 font-semibold', right && 'text-right')}
    >
      {sortable && sortKey && onSort ? (
        <button
          onClick={() => onSort(sortKey)}
          className={cx('inline-flex items-center gap-1 hover:text-fg-muted', active && 'text-primary-bright', right && 'w-full justify-end')}
        >
          {children}
          <span className="text-[8px]">{active ? '▼' : '⇅'}</span>
        </button>
      ) : (
        children
      )}
    </th>
  )
}

/** Left ops rail: the account rate-limit bars (subscription only), then the usage stats (This week,
 *  Model mix, By project) and a capability line. Bars are absent for an API account or when no
 *  statusLine data has arrived — ADR-0001's graceful degradation. Hidden below the `lg` breakpoint. */
function Rail({
  stats,
  caps,
  account,
  now,
}: {
  stats: Stats | null
  caps: ProviderCapabilities | null
  account: Account | null
  now: number
}) {
  const weekTotal = stats ? stats.weeklyActivity.reduce((sum, d) => sum + d.equivApiValueUsd, 0) : 0
  const maxValue = stats ? Math.max(0, ...stats.weeklyActivity.map((d) => d.equivApiValueUsd)) : 0

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-ink-800 bg-ink-925 p-4 lg:flex">
      {/* Account rate limits (subscription only; renders nothing otherwise) — its own bottom divider. */}
      <RateLimits account={account} now={now} variant="rail" />
      {stats && (
        <>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">This week</div>
            <div className="font-mono text-xl text-fg">~{formatUsd(weekTotal)}</div>
            <div
              role="img"
              aria-label={`Activity over the last 7 days, ~${formatUsd(weekTotal)} equivalent API value`}
              className="mt-2 flex h-9 items-end gap-1"
            >
              {stats.weeklyActivity.map((d) => (
                <div
                  key={d.dayStartMs}
                  title={`${weekdayUtc(d.dayStartMs)}: ${d.sessions} session${d.sessions === 1 ? '' : 's'} · ~${formatUsd(d.equivApiValueUsd)}`}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-sm bg-primary"
                      style={{
                        height: `${maxValue > 0 ? (d.equivApiValueUsd / maxValue) * 100 : 0}%`,
                        minHeight: d.sessions > 0 ? 2 : 0,
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-fg-faint">{weekdayUtc(d.dayStartMs)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-ink-800 pt-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Model mix</div>
            {stats.modelMix.length === 0 ? (
              <span className="text-[11px] text-fg-faint">No usage yet.</span>
            ) : (
              <div className="space-y-1">
                {stats.modelMix.map((m) => (
                  <div key={m.model} className="flex items-center justify-between">
                    <span className="text-[12px] text-fg">{MODEL_LABEL[m.model]}</span>
                    <span className="ml-2 shrink-0 font-mono text-[10px] tabular-nums text-fg-muted">{m.sessions} · ~{formatUsd(m.equivApiValueUsd)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-ink-800 pt-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">By project</div>
            {stats.projectRollup.length === 0 ? (
              <span className="text-[11px] text-fg-faint">No usage yet.</span>
            ) : (
              <div className="space-y-1">
                {stats.projectRollup.slice(0, TOP_PROJECTS).map((p) => (
                  <div key={p.project} className="flex items-center justify-between">
                    <span className="truncate font-mono text-[11px] text-fg">{p.project}</span>
                    <span className="ml-2 shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">{p.sessions} · ~{formatUsd(p.equivApiValueUsd)}</span>
                  </div>
                ))}
                {stats.projectRollup.length > TOP_PROJECTS && (
                  <div className="text-[10px] text-fg-faint">+{stats.projectRollup.length - TOP_PROJECTS} more</div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {caps && (
        <div className="mt-auto border-t border-ink-800 pt-3 text-[11px] text-fg-faint">
          ClaudeProvider · control {caps.canControl ? '✓' : '✗'} · limits {caps.hasRateLimits ? '✓' : '✗'} · subagents {caps.hasSubagents ? '✓' : '✗'}
        </div>
      )}
    </aside>
  )
}

/** Short UTC weekday label for a day bucket — UTC to match the UTC-day bucketing in computeStats. */
function weekdayUtc(dayStartMs: number): string {
  return new Date(dayStartMs).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}
