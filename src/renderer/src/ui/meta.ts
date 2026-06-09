import type { ModelId, SessionState } from '@shared/types'

export interface StateMeta {
  label: string
  /** Tailwind bg class for the status dot. */
  dot: string
  /** Tailwind text class for the label. */
  text: string
}

/** Per-state display metadata. Ported from the prototype (slated for deletion in #10); the real
 *  Overview will draw from here too. */
export const STATE_META: Record<SessionState, StateMeta> = {
  working: { label: 'Working', dot: 'bg-primary', text: 'text-primary-bright' },
  waiting: { label: 'Waiting', dot: 'bg-accent', text: 'text-accent-bright' },
  idle: { label: 'Idle', dot: 'bg-fg-faint', text: 'text-fg-muted' },
  ended: { label: 'Ended', dot: 'bg-ink-600', text: 'text-fg-faint' },
}

export const MODEL_LABEL: Record<ModelId, string> = {
  'claude-opus-4-8': 'Opus 4.8',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-haiku-4-5': 'Haiku 4.5',
}
