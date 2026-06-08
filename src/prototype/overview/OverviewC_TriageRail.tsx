// PROTOTYPE Variant C — "Triage". Organized by what needs action, not by
// enumeration. Waiting sessions are big action cards; account health is the
// hero on the right. Radically different hierarchy from A and B.
import type { Account, Session, Stats } from '../types'
import { ctxBar, ctxTone, fmtRel, fmtUsd, limitBar } from '../lib'
import { now } from '../mockData'
import { Bar, ManagementChip, ModelChip, Ring, cx } from '../components'

export const name = 'Triage rail'

export function OverviewC_TriageRail({ sessions, account, stats, onOpen }: { sessions: Session[]; account: Account; stats: Stats; onOpen: (id: string) => void }) {
  const waiting = sessions.filter((s) => s.state === 'waiting')
  const working = sessions.filter((s) => s.state === 'working').sort((a, b) => a.lastActivityMs - b.lastActivityMs)
  const idle = sessions.filter((s) => s.state === 'idle')
  const ended = sessions.filter((s) => s.state === 'ended')

  return (
    <div className="grid h-full grid-cols-1 gap-0 lg:grid-cols-[1.7fr_1fr]">
      {/* Left — action queue */}
      <div className="overflow-y-auto px-7 py-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-accent-bright">Needs you</h2>
          <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[11px] text-accent-bright">{waiting.length}</span>
        </div>

        {waiting.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink-800 px-4 py-6 text-center text-sm text-fg-faint">
            Nothing blocked on you. Nice.
          </div>
        )}

        <div className="space-y-3">
          {waiting.map((s) => (
            <button
              key={s.id}
              onClick={() => onOpen(s.id)}
              className="block w-full rounded-xl border border-accent/50 bg-accent/[0.07] p-4 text-left transition-colors hover:bg-accent/[0.12]"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                  <span className="h-2 w-2 animate-pulse-soft rounded-full bg-accent" />
                  {s.title}
                </span>
                <ManagementChip kind={s.management} />
              </div>
              <div className="mt-1 font-mono text-[11px] text-fg-faint">{s.project}{s.branch && ` · ${s.branch}`}</div>
              <div className="mt-3 rounded-lg border border-accent/25 bg-ink-950/40 px-3 py-2 font-mono text-[12px] text-accent-bright">
                {s.waitingReason}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-ink-950">Respond →</span>
                <span className="font-mono text-[11px] text-fg-faint">idle {fmtRel(s.lastActivityMs, now)}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-7 mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-primary-bright">Working now</h2>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[11px] text-primary-bright">{working.length}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {working.map((s) => (
            <button
              key={s.id}
              onClick={() => onOpen(s.id)}
              className="block rounded-xl border border-ink-800 bg-ink-900/70 p-3.5 text-left transition-colors hover:border-ink-700 hover:bg-ink-850"
            >
              <div className="flex items-center justify-between">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <span className="truncate text-[13px] font-medium text-fg">{s.title}</span>
                </span>
                <ModelChip model={s.model} />
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-fg-faint">{s.project}{s.branch && ` · ${s.branch}`}</div>
              {s.currentTask && <div className="mt-2 truncate text-[11px] text-fg-muted">▸ {s.currentTask}</div>}
              <div className="mt-2.5 flex items-center gap-2">
                <Bar pct={s.contextPct} fill={ctxBar(s.contextPct)} className="flex-1" />
                <span className={cx('font-mono text-[11px]', ctxTone(s.contextPct))}>{s.contextPct}%</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right — account health hero + quiet lists */}
      <div className="overflow-y-auto border-t border-ink-800 bg-ink-925 px-6 py-6 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Account health</span>
          <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{account.plan}</span>
        </div>
        <div className="mt-4 flex items-center justify-around">
          <RingStat label="5-hour" pct={account.fiveHour.usedPct} resetsAt={account.fiveHour.resetsAt} />
          <RingStat label="7-day" pct={account.sevenDay.usedPct} resetsAt={account.sevenDay.resetsAt} />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-ink-900/60 px-3 py-2">
          <span className="text-[11px] text-fg-muted">This week</span>
          <span className="font-mono text-sm text-fg">~{fmtUsd(stats.weekEquivUsd)}</span>
        </div>

        <QuietList title="Idle — ready" items={idle} onOpen={onOpen} tone="text-fg-muted" />
        <QuietList title="Recent" items={ended} onOpen={onOpen} tone="text-fg-faint" />
      </div>
    </div>
  )
}

function RingStat({ label, pct, resetsAt }: { label: string; pct: number; resetsAt: number }) {
  const color = pct >= 90 ? 'var(--color-danger)' : pct >= 75 ? 'var(--color-accent)' : 'var(--color-primary)'
  return (
    <div className="flex flex-col items-center">
      <Ring pct={pct} size={92} stroke={8} color={color}>
        <span className="font-mono text-lg text-fg">{pct}%</span>
      </Ring>
      <div className="mt-2 text-center">
        <div className="text-[11px] text-fg-muted">{label}</div>
        <div className="font-mono text-[10px] text-fg-faint">resets {fmtCountdownLocal(resetsAt)}</div>
      </div>
    </div>
  )
}

function fmtCountdownLocal(resetsAt: number): string {
  const s = Math.max(0, Math.round((resetsAt - now) / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function QuietList({ title, items, onOpen, tone }: { title: string; items: Session[]; onOpen: (id: string) => void; tone: string }) {
  if (items.length === 0) return null
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
        {title} <span className="font-mono">{items.length}</span>
      </div>
      <div className="space-y-0.5">
        {items.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpen(s.id)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-ink-850"
          >
            <span className={cx('truncate text-[12px]', tone)}>{s.title}</span>
            <span className="ml-2 shrink-0 font-mono text-[10px] text-fg-faint">{s.project}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
