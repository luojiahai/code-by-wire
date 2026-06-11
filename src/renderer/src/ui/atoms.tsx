import type { Management, SessionState } from '@shared/types'
import { glyphClass, glyphPulses, glyphTitle } from './session-glyph'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** The session glyph: color = state, fill = management. Pass `management` for a session dot (filled when
 *  managed, hollow ring when observed, with a "state · management" tooltip); omit it for the state-group
 *  headers, which are about state alone and stay filled. */
export function Dot({ state, management }: { state: SessionState; management?: Management }) {
  const cls = glyphClass(state, management ?? 'managed')
  return (
    <span
      title={management ? glyphTitle(state, management) : undefined}
      className={cx('relative inline-flex h-2 w-2 rounded-full', cls)}
    >
      {glyphPulses(state) && <span className={cx('absolute inset-0 rounded-full', cls, 'animate-pulse-soft')} />}
    </span>
  )
}

/** A small colored square that keys a legend row to its diagram segment. `color` is any CSS color
 *  string (a token var, a color-mix). Shared by the cost/token legends so the key never drifts. */
export function Swatch({ color }: { color: string }) {
  return <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} />
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
