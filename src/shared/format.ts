/** Equivalent API value as a short dollar string: $0.30 / $6.42 / $42.0 / $143. */
export function formatUsd(n: number): string {
  if (n >= 100) return '$' + n.toFixed(0)
  if (n >= 10) return '$' + n.toFixed(1)
  return '$' + n.toFixed(2)
}

/** Relative time like "now" / "45s ago" / "10m ago" / "3h ago" / "2d ago". */
export function formatRelativeTime(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 8) return 'now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
