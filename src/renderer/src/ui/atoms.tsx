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
