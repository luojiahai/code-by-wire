// PROTOTYPE Variant B — "Mission control". A thin ops rail + a dense, sortable,
// filterable table. The power-user, many-sessions, scan-rows take.
import { useState } from 'react'
import type { Account, Session, SessionState, Stats } from '../types'
import { STATE_META, STATE_ORDER, ctxBar, ctxTone, fmtRel, fmtTokens, fmtUsd } from '../lib'
import { now } from '../mockData'
import { Bar, Dot, ManagementChip, ModelChip, RateLimitBar, cx } from '../components'

export const name = 'Mission control table'

type SortKey = 'default' | 'ctx' | 'value' | 'last'
type Filter = 'all' | SessionState

export function OverviewB_MissionTable({ sessions, account, stats, onOpen }: { sessions: Session[]; account: Account; stats: Stats; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<SortKey>('default')

  const counts: Record<string, number> = { all: sessions.length }
  for (const s of sessions) counts[s.state] = (counts[s.state] ?? 0) + 1

  let rows = sessions.filter((s) => filter === 'all' || s.state === filter)
  rows = [...rows].sort((a, b) => {
    if (sort === 'ctx') return b.contextPct - a.contextPct
    if (sort === 'value') return b.equivApiValueUsd - a.equivApiValueUsd
    if (sort === 'last') return b.lastActivityMs - a.lastActivityMs
    return STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.lastActivityMs - a.lastActivityMs
  })

  const filters: Filter[] = ['all', 'waiting', 'working', 'idle', 'ended']

  return (
    <div className="flex h-full">
      {/* Rail */}
      <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-ink-800 bg-ink-925 p-4 lg:flex">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Account</span>
            <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{account.plan}</span>
          </div>
          <div className="space-y-3">
            <RateLimitBar label="5-hour" pct={account.fiveHour.usedPct} resetsAt={account.fiveHour.resetsAt} />
            <RateLimitBar label="7-day" pct={account.sevenDay.usedPct} resetsAt={account.sevenDay.resetsAt} />
          </div>
        </div>

        <div className="border-t border-ink-800 pt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">This week</div>
          <div className="font-mono text-xl text-fg">~{fmtUsd(stats.weekEquivUsd)}</div>
          <div className="font-mono text-[11px] text-fg-faint">{fmtTokens(stats.weekTokens)} tokens</div>
        </div>

        <div className="border-t border-ink-800 pt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">By project</div>
          <div className="space-y-1.5">
            {stats.projectRollup.map((p) => (
              <div key={p.project} className="flex items-center justify-between">
                <span className="truncate font-mono text-[11px] text-fg">{p.project}</span>
                <span className="ml-2 shrink-0 font-mono text-[10px] text-fg-faint">{p.sessions} · ~{fmtUsd(p.equivUsd)}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-ink-800 px-5 py-3">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cx(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs capitalize transition-colors',
                filter === f ? 'bg-ink-750 text-fg' : 'text-fg-muted hover:bg-ink-850',
              )}
            >
              {f !== 'all' && <Dot state={f} />}
              {f}
              <span className="font-mono text-[10px] text-fg-faint">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-ink-925 text-left">
              <tr className="text-[10px] uppercase tracking-wider text-fg-faint">
                <Th>State</Th>
                <Th>Session</Th>
                <Th>Model</Th>
                <Th sortable active={sort === 'ctx'} onClick={() => setSort('ctx')}>Context</Th>
                <Th sortable active={sort === 'value'} onClick={() => setSort('value')} right>~Value</Th>
                <Th sortable active={sort === 'last'} onClick={() => setSort('last')} right>Last</Th>
                <Th>Activity</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const waiting = s.state === 'waiting'
                return (
                  <tr
                    key={s.id}
                    onClick={() => onOpen(s.id)}
                    className={cx(
                      'cursor-pointer border-b border-ink-800/70 transition-colors hover:bg-ink-850',
                      waiting && 'bg-accent/[0.06]',
                    )}
                  >
                    <td className={cx('py-2.5 pl-5 pr-3', waiting && 'border-l-2 border-accent')}>
                      <span className={cx('inline-flex items-center gap-1.5 text-[11px]', STATE_META[s.state].text)}>
                        <Dot state={s.state} />
                        {STATE_META[s.state].label}
                      </span>
                    </td>
                    <td className="max-w-[340px] py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <ManagementChip kind={s.management} />
                        <span className="truncate text-[13px] text-fg">{s.title}</span>
                      </div>
                      <div className="truncate font-mono text-[10px] text-fg-faint">{s.project}{s.branch && ` · ${s.branch}`}</div>
                    </td>
                    <td className="py-2.5 pr-3"><ModelChip model={s.model} /></td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <Bar pct={s.contextPct} fill={ctxBar(s.contextPct)} className="w-16" />
                        <span className={cx('font-mono text-[11px] tabular-nums', ctxTone(s.contextPct))}>{s.contextPct}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-[11px] text-fg-muted">~{fmtUsd(s.equivApiValueUsd)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-[11px] text-fg-faint">{fmtRel(s.lastActivityMs, now)}</td>
                    <td className="max-w-[260px] py-2.5 pr-5">
                      <span className={cx('block truncate text-[11px]', waiting ? 'text-accent-bright' : 'text-fg-muted')}>
                        {waiting ? `⚠ ${s.waitingReason}` : s.currentTask}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Th({ children, sortable, active, onClick, right }: { children: React.ReactNode; sortable?: boolean; active?: boolean; onClick?: () => void; right?: boolean }) {
  return (
    <th className={cx('whitespace-nowrap px-3 py-2.5 font-semibold', right && 'text-right')}>
      {sortable ? (
        <button onClick={onClick} className={cx('inline-flex items-center gap-1 hover:text-fg-muted', active ? 'text-primary-bright' : '')}>
          {children}
          <span className="text-[8px]">{active ? '▼' : '⇅'}</span>
        </button>
      ) : (
        children
      )}
    </th>
  )
}
