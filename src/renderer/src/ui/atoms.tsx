import type { Management, ModelId, SessionState } from '@shared/types'
import { MODEL_SHORT, STATE_META } from './meta'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function Dot({ state }: { state: SessionState }) {
  const m = STATE_META[state]
  const live = state === 'working' || state === 'waiting'
  return (
    <span className={cx('relative inline-flex h-2 w-2 rounded-full', m.dot)}>
      {live && <span className={cx('absolute inset-0 rounded-full animate-pulse-soft', m.dot)} />}
    </span>
  )
}

export function StateBadge({ state }: { state: SessionState }) {
  const m = STATE_META[state]
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide', m.text)}>
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
        managed ? 'bg-primary/12 text-primary-bright ring-1 ring-primary/25' : 'text-fg-faint ring-1 ring-ink-700',
      )}
      title={managed ? 'Managed — spawned and driven by code-by-wire' : 'Observed — running elsewhere, read-only'}
    >
      {managed ? '▣ managed' : '◇ observed'}
    </span>
  )
}

/** A thin progress bar. `fill` is a Tailwind bg class; the track is fixed `bg-ink-800`. No width
 *  transition on purpose: the Overview re-syncs every few seconds, and animating every row's bar on
 *  each pass reads as noise in a dense table. */
export function Bar({ pct, fill, className }: { pct: number; fill: string; className?: string }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-ink-800', className)}>
      <div className={cx('h-full rounded-full', fill)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

/** Compact model name, dimmer for the cheaper models. */
export function ModelChip({ model }: { model: ModelId }) {
  const tone = model === 'claude-opus-4-8' ? 'text-fg' : model === 'claude-sonnet-4-6' ? 'text-fg-muted' : 'text-fg-faint'
  return <span className={cx('font-mono text-[11px]', tone)}>{MODEL_SHORT[model]}</span>
}
