import type { Management, SessionState } from '@shared/types'
import { STATE_META } from './meta'

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
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide', m.text)}>
      <Dot state={state} />
      {m.label}
    </span>
  )
}

/** Managed shows a filled square marker on a sky tint; Observed shows a hollow ring on a hairline. */
export function ManagementChip({ kind }: { kind: Management }) {
  const managed = kind === 'managed'
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        managed ? 'bg-primary/12 text-primary-bright ring-1 ring-primary/30' : 'text-fg-faint ring-1 ring-ink-800',
      )}
      title={managed ? 'Managed — spawned and driven by code-by-wire' : 'Observed — running elsewhere, read-only'}
    >
      <span
        className={cx(
          'h-1.5 w-1.5',
          managed ? 'rounded-[2px] bg-primary' : 'rounded-full border-[1.5px] border-fg-faint',
        )}
      />
      {managed ? 'managed' : 'observed'}
    </span>
  )
}

/** A thin progress bar. `fill` is a Tailwind bg class; the track is fixed `bg-ink-850`. The caller
 *  sizes it via `className` (e.g. `w-16`). No width transition: the list re-syncs every few seconds
 *  and animating every bar reads as noise. */
export function Bar({ pct, fill, className }: { pct: number; fill: string; className?: string }) {
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-ink-850', className)}>
      <div className={cx('h-full rounded-full', fill)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

/** The brand mark: a node–wire–node monogram (teal dot · sky bar · amber dot) plus the wordmark with
 *  "wire" in the sky accent. Built from primitives — no raster logo ships with the product. */
export function Wordmark() {
  return (
    <div className="inline-flex shrink-0 items-center gap-2.5">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-ink-700 bg-ink-900">
        <span className="inline-flex items-center">
          <span className="h-[5px] w-[5px] rounded-full bg-working" />
          <span className="h-0.5 w-[9px] bg-primary" />
          <span className="h-[5px] w-[5px] rounded-full bg-accent" />
        </span>
      </span>
      <span className="font-display text-[15px] font-semibold tracking-tight text-fg">
        code-by-<span className="text-primary">wire</span>
      </span>
    </div>
  )
}
