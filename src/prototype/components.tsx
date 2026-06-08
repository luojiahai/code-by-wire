// PROTOTYPE — throwaway shared atoms. Layout-free building blocks the three
// Overview variants and the Workspace all draw from. No layout lives here.
import type { ReactNode } from 'react'
import type { Management, ModelId, SessionState } from './types'
import { MODEL_META, STATE_META, fmtCountdown, limitBar } from './lib'
import { now } from './mockData'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function Dot({ state, className }: { state: SessionState; className?: string }) {
  const m = STATE_META[state]
  const live = state === 'working' || state === 'waiting'
  return (
    <span className={cx('relative inline-flex h-2 w-2 rounded-full', m.dot, className)}>
      {live && <span className={cx('absolute inset-0 rounded-full animate-pulse-soft', m.dot)} />}
    </span>
  )
}

export function StateBadge({ state, className }: { state: SessionState; className?: string }) {
  const m = STATE_META[state]
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide', m.text, className)}>
      <Dot state={state} />
      {m.label}
    </span>
  )
}

export function ManagementChip({ kind }: { kind: Management }) {
  const managed = kind === 'managed'
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        managed
          ? 'bg-primary/12 text-primary-bright ring-1 ring-primary/25'
          : 'text-fg-faint ring-1 ring-ink-700',
      )}
      title={managed ? 'Managed — spawned and driven by code-by-wire' : 'Observed — running elsewhere, read-only'}
    >
      {managed ? '▣ managed' : '◇ observed'}
    </span>
  )
}

export function ModelChip({ model, className }: { model: ModelId; className?: string }) {
  const m = MODEL_META[model]
  const tone = model === 'claude-opus-4-8' ? 'text-fg' : model === 'claude-sonnet-4-6' ? 'text-fg-muted' : 'text-fg-faint'
  return <span className={cx('font-mono text-[11px]', tone, className)}>{m.short}</span>
}

export function Bar({ pct, fill, track, className }: { pct: number; fill: string; track?: string; className?: string }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full', track ?? 'bg-ink-800', className)}>
      <div className={cx('h-full rounded-full transition-all', fill)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

export function RateLimitBar({ label, pct, resetsAt, big }: { label: string; pct: number; resetsAt: number; big?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className={cx('text-fg-muted', big ? 'text-xs' : 'text-[11px]')}>{label}</span>
        <span className="font-mono text-fg">
          <span className={big ? 'text-base' : 'text-xs'}>{pct}%</span>
          <span className="ml-2 text-[10px] text-fg-faint">resets {fmtCountdown(resetsAt, now)}</span>
        </span>
      </div>
      <Bar pct={pct} fill={limitBar(pct)} className={big ? 'h-2' : ''} />
    </div>
  )
}

export function Ring({
  pct, size = 64, stroke = 6, color = 'var(--color-primary)', children,
}: { pct: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-ink-800)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

export function Sparkline({ data, w = 120, h = 30, color = 'var(--color-primary)' }: { data: number[]; w?: number; h?: number; color?: string }) {
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const span = Math.max(max - min, 1)
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((d - min) / span) * (h - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const area = `0,${h} ${pts.join(' ')} ${w},${h}`
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polygon points={area} fill={color} opacity={0.1} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function Panel({ title, right, children, className, bodyClass }: { title: string; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cx('rounded-lg border border-ink-800 bg-ink-900/60', className)}>
      <header className="flex items-center justify-between border-b border-ink-800 px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{title}</h3>
        {right}
      </header>
      <div className={cx('p-3', bodyClass)}>{children}</div>
    </section>
  )
}

export function Kv({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] text-fg-faint">{k}</span>
      <span className={cx('font-mono text-xs', tone ?? 'text-fg')}>{v}</span>
    </div>
  )
}
