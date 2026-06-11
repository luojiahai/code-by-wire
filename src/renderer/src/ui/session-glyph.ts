import type { Management, SessionState } from '@shared/types'
import { STATE_META } from './meta'

/** The dot's Tailwind classes. Color tracks state (via STATE_META); a managed session is a filled dot,
 *  an observed one is a hollow ring in the same color. Pure so the renderer's Dot stays a thin shell and
 *  the encoding is unit-tested. The ring class comes from STATE_META as a literal string (not synthesized)
 *  so Tailwind's scanner actually emits the border utility. */
export function glyphClass(state: SessionState, management: Management): string {
  const m = STATE_META[state]
  if (management === 'observed') {
    return `border-[1.5px] bg-transparent ${m.ring}`
  }
  return m.dot
}

/** Hover tooltip for a session glyph: "waiting · observed". The one spot the dot is spelled out in full. */
export function glyphTitle(state: SessionState, management: Management): string {
  return `${STATE_META[state].label.toLowerCase()} · ${management}`
}

/** Only live sessions (working, waiting) get the soft pulse; idle and ended sit still. */
export function glyphPulses(state: SessionState): boolean {
  return state === 'working' || state === 'waiting'
}
