// PROTOTYPE Variant A — "Fleet grid". Hero strip + a responsive grid of rich
// session tiles. The browse-everything-at-a-glance take.
import type { Account, Session, SessionState, Stats } from '../types'
import { STATE_ORDER, ctxBar, ctxTone, fmtRel, fmtTokens, fmtUsd } from '../lib'
import { now } from '../mockData'
import { Bar, ManagementChip, ModelChip, RateLimitBar, Sparkline, StateBadge, cx } from '../components'

export const name = 'Fleet grid'

function count(sessions: Session[], s: SessionState) {
  return sessions.filter((x) => x.state === s).length
}

function Card({ s, onOpen }: { s: Session; onOpen: (id: string) => void }) {
  const waiting = s.state === 'waiting'
  const live = s.state === 'working' || s.state === 'waiting'
  return (
    <button
      onClick={() => onOpen(s.id)}
      className={cx(
        'group flex flex-col rounded-xl border bg-ink-900/70 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:bg-ink-850',
        waiting ? 'border-accent/55 shadow-[0_0_0_1px_rgba(191,128,64,0.15),0_8px_24px_-12px_rgba(191,128,64,0.4)]' : 'border-ink-800 hover:border-ink-700',
      )}
    >
      <div className="flex items-center justify-between">
        <StateBadge state={s.state} />
        <ManagementChip kind={s.management} />
      </div>

      <div className="mt-2.5 line-clamp-2 text-[13px] font-medium leading-snug text-fg">{s.title}</div>
      <div className="mt-1 truncate font-mono text-[11px] text-fg-faint">
        {s.project}
        {s.branch && <span className="text-ink-600"> · {s.branch}</span>}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Bar pct={s.contextPct} fill={ctxBar(s.contextPct)} className="flex-1" />
        <span className={cx('font-mono text-[11px] tabular-nums', ctxTone(s.contextPct))}>{s.contextPct}%</span>
        <ModelChip model={s.model} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-ink-800 pt-2.5">
        <span className="font-mono text-[11px] text-fg-muted" title="equivalent API value">~{fmtUsd(s.equivApiValueUsd)}</span>
        <span className="font-mono text-[11px] text-fg-faint">{fmtRel(s.lastActivityMs, now)}</span>
      </div>

      {(waiting || s.currentTask) && (
        <div className={cx('mt-2.5 truncate rounded-md px-2 py-1.5 text-[11px]', waiting ? 'bg-accent/12 text-accent-bright' : 'bg-ink-850 text-fg-muted')}>
          {waiting ? <span className="font-medium">⚠ {s.waitingReason}</span> : <span>{live && '▸ '}{s.currentTask}</span>}
        </div>
      )}
    </button>
  )
}

export function OverviewA_FleetGrid({ sessions, account, stats, onOpen }: { sessions: Session[]; account: Account; stats: Stats; onOpen: (id: string) => void }) {
  const ordered = [...sessions].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.lastActivityMs - a.lastActivityMs)
  const live = sessions.filter((s) => s.state === 'working' || s.state === 'waiting').length

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-7">
      {/* Hero */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr_1fr]">
        <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Account health</span>
            <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{account.plan}</span>
          </div>
          <div className="space-y-3">
            <RateLimitBar label="5-hour limit" pct={account.fiveHour.usedPct} resetsAt={account.fiveHour.resetsAt} />
            <RateLimitBar label="7-day limit" pct={account.sevenDay.usedPct} resetsAt={account.sevenDay.resetsAt} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-ink-800 bg-ink-900/60 p-4">
          <Stat n={count(sessions, 'waiting')} label="Waiting" tone="text-accent-bright" loud />
          <Stat n={count(sessions, 'working')} label="Working" tone="text-primary-bright" />
          <Stat n={count(sessions, 'idle')} label="Idle" tone="text-fg-muted" />
          <Stat n={live} label="Live total" tone="text-fg" />
        </div>

        <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">This week</span>
            <span className="font-mono text-[10px] text-fg-faint">equiv. API value</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="font-mono text-2xl text-fg">~{fmtUsd(stats.weekEquivUsd)}</div>
              <div className="font-mono text-[11px] text-fg-faint">{fmtTokens(stats.weekTokens)} tokens</div>
            </div>
            <Sparkline data={stats.weeklyMessages.map((d) => d.count)} w={120} h={36} color="var(--color-primary)" />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mt-7 mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-fg">Sessions</h2>
        <span className="font-mono text-xs text-fg-faint">{sessions.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ordered.map((s) => (
          <Card key={s.id} s={s} onOpen={onOpen} />
        ))}
      </div>

      {/* Stats strip */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Model mix (week)</div>
          <ModelMix stats={stats} />
        </div>
        <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">By project</div>
          <div className="space-y-1.5">
            {stats.projectRollup.map((p) => (
              <div key={p.project} className="flex items-center justify-between">
                <span className="font-mono text-xs text-fg">{p.project}</span>
                <span className="font-mono text-[11px] text-fg-faint">{p.sessions} sessions · ~{fmtUsd(p.equivUsd)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ n, label, tone, loud }: { n: number; label: string; tone: string; loud?: boolean }) {
  return (
    <div className={cx('flex flex-col justify-center rounded-lg px-3 py-2', loud && n > 0 ? 'bg-accent/10 ring-1 ring-accent/25' : 'bg-ink-850')}>
      <span className={cx('font-mono text-2xl leading-none', tone)}>{n}</span>
      <span className="mt-1 text-[11px] text-fg-muted">{label}</span>
    </div>
  )
}

function ModelMix({ stats }: { stats: Stats }) {
  const total = stats.modelMix.reduce((a, m) => a + m.tokens, 0)
  const colors: Record<string, string> = {
    'claude-opus-4-8': 'bg-primary',
    'claude-sonnet-4-6': 'bg-accent/80',
    'claude-haiku-4-5': 'bg-ink-600',
  }
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {stats.modelMix.map((m) => (
          <div key={m.model} className={colors[m.model]} style={{ width: `${(m.tokens / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {stats.modelMix.map((m) => (
          <span key={m.model} className="flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span className={cx('h-2 w-2 rounded-sm', colors[m.model])} />
            {m.model.replace('claude-', '').replace('-4-8', ' 4.8').replace('-4-6', ' 4.6').replace('-4-5', ' 4.5')}
            <span className="font-mono text-fg-faint">{Math.round((m.tokens / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}
