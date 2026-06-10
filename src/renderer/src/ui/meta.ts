import type { ModelId, SessionState } from '@shared/types'
import { isKnownModelString } from '@shared/models'

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

/** Tailwind fill for a progress bar: blue when roomy, amber as it fills, bright at/over `high`. Shared by
 *  the context bars (high 85) and the rate-limit bars (high 90) so the two never drift apart on retone. */
export function barFill(pct: number, high = 85): string {
  if (pct >= high) return 'bg-accent'
  if (pct >= 70) return 'bg-accent/80'
  return 'bg-primary/70'
}

/** Tailwind fill for the context bar: blue when roomy, amber as it fills. */
export function ctxBar(pct: number): string {
  return barFill(pct, 85)
}

/** The display label for a Session's model. A recognized model (its statusLine model.id matches a known
 *  family) shows the app's clean label from `table`; a model absent from the table shows the capture's
 *  real display_name — or its raw id when the capture omitted the name — so it never masquerades as the
 *  Opus fallback. With no capture, the clean label stands; pricing and window keep riding the normalized
 *  `model` regardless. */
export function honestModelLabel(
  model: ModelId,
  captureModelId: string | undefined,
  captureDisplayName: string | undefined,
  table: Record<ModelId, string>,
): string {
  if (captureModelId && !isKnownModelString(captureModelId)) return captureDisplayName || captureModelId
  return table[model]
}
