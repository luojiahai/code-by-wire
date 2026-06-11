import type { ReactNode } from 'react'
import { cx } from '../../ui/atoms'

/** One dense metric row: label left, value right (mono, tabular). A null/undefined value renders a muted
 *  em-dash so the row position stays stable (the empty-state rule). `tone` is an optional Tailwind text
 *  class for the value (e.g. ctxTone / text-accent-bright). */
export function MetricRow({
  label,
  value,
  tone,
  title,
}: {
  label: string
  value: ReactNode | null | undefined
  tone?: string
  title?: string
}) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5" title={title}>
      <span className="text-[12px] text-fg-muted">{label}</span>
      <span className={cx('font-mono text-[12px] tabular-nums', empty ? 'text-ink-600' : tone ?? 'text-fg')}>
        {empty ? '—' : value}
      </span>
    </div>
  )
}
