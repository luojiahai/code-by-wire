import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Session, ProviderCapabilities } from '@shared/types'
import { pinWaiting } from '@shared/overview'
import { formatUsd, formatRelativeTime } from '@shared/format'

const STATE_LABEL: Record<Session['state'], string> = {
  working: 'Working',
  waiting: 'Waiting',
  idle: 'Idle',
  ended: 'Ended',
}

const cell: CSSProperties = { padding: '6px 8px' }
const muted: CSSProperties = { ...cell, color: 'var(--color-fg-muted)' }
const numeric: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [caps, setCaps] = useState<ProviderCapabilities | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(): Promise<void> {
    setLoading(true)
    try {
      const [s, c] = await Promise.all([window.api.listSessions(), window.api.capabilities()])
      setSessions(s)
      setCaps(c)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      setSessions(await window.api.refresh())
    } finally {
      setLoading(false)
    }
  }

  const rows = useMemo(() => pinWaiting(sessions), [sessions])
  const now = Date.now()

  return (
    <div className="app-bg" style={{ minHeight: '100vh', padding: 24, color: 'var(--color-fg)' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>code-by-wire</h1>
        <span style={{ color: 'var(--color-fg-muted)', fontSize: 13 }}>
          {sessions.length} session{sessions.length === 1 ? '' : 's'}
        </span>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            background: 'var(--color-ink-800)',
            color: 'var(--color-fg)',
            border: '1px solid var(--color-ink-700)',
            borderRadius: 6,
            padding: '4px 12px',
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Syncing…' : 'Refresh'}
        </button>
      </header>

      {sessions.length === 0 && !loading ? (
        <p style={{ color: 'var(--color-fg-muted)' }}>No Claude Code sessions found.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr
              style={{
                textAlign: 'left',
                color: 'var(--color-fg-muted)',
                borderBottom: '1px solid var(--color-ink-700)',
              }}
            >
              <th style={cell}>State</th>
              <th style={cell}>Title</th>
              <th style={cell}>Project</th>
              <th style={cell}>Branch</th>
              <th style={cell}>Model</th>
              <th style={numeric}>Context</th>
              <th style={numeric}>Equiv. value</th>
              <th style={cell}>Last activity</th>
              <th style={cell}>Mgmt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--color-ink-850)' }}>
                <td style={cell}>{STATE_LABEL[s.state]}</td>
                <td style={cell}>{s.title}</td>
                <td style={muted}>{s.project}</td>
                <td style={muted}>{s.branch ?? '—'}</td>
                <td style={cell}>{s.model}</td>
                <td style={numeric}>{s.contextPct}%</td>
                <td style={numeric}>{formatUsd(s.equivApiValueUsd)}</td>
                <td style={muted}>{formatRelativeTime(s.lastActivityMs, now)}</td>
                <td style={muted}>{s.management}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {caps && (
        <footer style={{ marginTop: 24, color: 'var(--color-fg-faint)', fontSize: 12 }}>
          ClaudeProvider · control {caps.canControl ? '✓' : '✗'} · limits{' '}
          {caps.hasRateLimits ? '✓' : '✗'} · subagents {caps.hasSubagents ? '✓' : '✗'}
        </footer>
      )}
    </div>
  )
}
