// PROTOTYPE — throwaway formatting + display helpers.
import type { ModelId, SessionState } from './types'

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000) + 'k'
  return String(n)
}

export function fmtUsd(n: number): string {
  if (n >= 100) return '$' + n.toFixed(0)
  if (n >= 10) return '$' + n.toFixed(1)
  return '$' + n.toFixed(2)
}

export function fmtRel(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 8) return 'now'
  if (s < 60) return s + 's ago'
  const m = Math.round(s / 60)
  if (m < 60) return m + 'm ago'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

export function fmtCountdown(resetsAt: number, now: number): string {
  const s = Math.max(0, Math.round((resetsAt - now) / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

export const MODEL_META: Record<ModelId, { short: string; label: string }> = {
  'claude-opus-4-8': { short: 'Opus', label: 'Opus 4.8' },
  'claude-sonnet-4-6': { short: 'Sonnet', label: 'Sonnet 4.6' },
  'claude-haiku-4-5': { short: 'Haiku', label: 'Haiku 4.5' },
}

export interface StateMeta {
  label: string
  dot: string
  text: string
  border: string
  glow: boolean
}

export const STATE_META: Record<SessionState, StateMeta> = {
  working: { label: 'Working', dot: 'bg-primary', text: 'text-primary-bright', border: 'border-primary/40', glow: false },
  waiting: { label: 'Waiting', dot: 'bg-accent', text: 'text-accent-bright', border: 'border-accent/55', glow: true },
  idle: { label: 'Idle', dot: 'bg-fg-faint', text: 'text-fg-muted', border: 'border-ink-700', glow: false },
  ended: { label: 'Ended', dot: 'bg-ink-600', text: 'text-fg-faint', border: 'border-ink-800', glow: false },
}

export const STATE_ORDER: Record<SessionState, number> = { waiting: 0, working: 1, idle: 2, ended: 3 }

export function ctxTone(pct: number): string {
  if (pct >= 85) return 'text-accent-bright'
  if (pct >= 70) return 'text-accent'
  return 'text-fg-muted'
}

export function ctxBar(pct: number): string {
  if (pct >= 85) return 'bg-accent'
  if (pct >= 70) return 'bg-accent/80'
  return 'bg-primary/70'
}

export function limitBar(pct: number): string {
  if (pct >= 90) return 'bg-danger'
  if (pct >= 75) return 'bg-accent'
  return 'bg-primary'
}
