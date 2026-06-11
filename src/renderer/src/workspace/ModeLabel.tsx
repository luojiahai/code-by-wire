import { useState } from 'react'
import type { Session } from '@shared/types'
import { cx, Dot } from '../ui/atoms'
import { Icon } from '../ui/icons'
import { MODE_INFO, MODE_ORDER } from './mode-info'

/** Header line-2 affordance: the session glyph next to its mode word (Managed/Observed) plus an info dot
 *  that opens a popover defining both modes. The glyph teaches the dot you also see in the sidebar; the
 *  popover is its legend. Opens on hover or keyboard focus of the info dot. */
export function ModeLabel({ session: s }: { session: Session }) {
  const [open, setOpen] = useState(false)
  const info = MODE_INFO[s.management]
  return (
    <span className="relative inline-flex shrink-0 items-center gap-1.5 text-fg-muted">
      <Dot state={s.state} management={s.management} />
      <span>{info.label}</span>
      <button
        type="button"
        aria-label="What do Managed and Observed mean?"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-ink-700 text-fg-faint transition-colors hover:text-fg-muted"
      >
        <Icon name="info" size={9} />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-6 z-20 w-64 overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-xl"
        >
          {MODE_ORDER.map((kind, i) => {
            const m = MODE_INFO[kind]
            const current = kind === s.management
            return (
              <div key={kind} className={cx('p-3', i > 0 && 'border-t border-ink-800', current && 'bg-accent/[0.06]')}>
                <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-fg">
                  <Dot state="idle" management={kind} />
                  <span>{m.label}</span>
                  {current && (
                    <span className="ml-auto rounded border border-accent/30 px-1 py-0.5 text-[9px] uppercase tracking-wider text-accent">
                      current
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-fg-muted">{m.blurb}</p>
              </div>
            )
          })}
        </div>
      )}
    </span>
  )
}
