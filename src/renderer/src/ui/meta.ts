import type { ModelId, SessionState } from '@shared/types'

export interface StateMeta {
  label: string
  /** Tailwind bg class for the status dot. */
  dot: string
  /** Tailwind text class for the label. */
  text: string
}

/** Per-state display metadata the Overview draws from. */
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

/** Compact model label for the dense table's Model column. */
export const MODEL_SHORT: Record<ModelId, string> = {
  'claude-opus-4-8': 'Opus',
  'claude-sonnet-4-6': 'Sonnet',
  'claude-haiku-4-5': 'Haiku',
}

/** Tailwind text tone for a context %: muted when roomy, amber and brightening as it fills. */
export function ctxTone(pct: number): string {
  if (pct >= 85) return 'text-accent-bright'
  if (pct >= 70) return 'text-accent'
  return 'text-fg-muted'
}

/** Tailwind fill for the context bar: blue when roomy, amber as it fills. */
export function ctxBar(pct: number): string {
  if (pct >= 85) return 'bg-accent'
  if (pct >= 70) return 'bg-accent/80'
  return 'bg-primary/70'
}
