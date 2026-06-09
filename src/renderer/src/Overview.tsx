import { useMemo, type CSSProperties } from 'react'
import type { Session, ProviderCapabilities } from '@shared/types'
import { pinWaiting } from '@shared/overview'
import { formatUsd, formatRelativeTime } from '@shared/format'
import { STATE_META } from './ui/meta'

const cell: CSSProperties = { padding: '6px 8px' }
const muted: CSSProperties = { ...cell, color: 'var(--color-fg-muted)' }
const numeric: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

interface Props {
  sessions: Session[]
  caps: ProviderCapabilities | null
  loading: boolean
  onRefresh: () => void
  onOpen: (session: Session) => void
  onNew: () => void
}

export function Overview({ sessions, caps, loading, onRefresh, onOpen, onNew }: Props) {
  const rows = useMemo(() => pinWaiting(sessions), [sessions])
  const now = Date.now()

  return (
    <div className="app-bg" style={{ minHeight: '100vh', padding: 24, color: 'var(--color-fg)' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>code-by-wire</h1>
        <span style={{ color: 'var(--color-fg-muted)', fontSize: 13 }}>
          {sessions.length} session{sessions.length === 1 ? '' : 's'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={onNew}
            style={{
              background: 'var(--color-primary)',
              color: 'var(--color-ink-950)',
              border: 'none',
              borderRadius: 6,
              padding: '4px 12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + New session
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
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
        </div>
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
              <tr
                key={s.id}
                className="row-clickable"
                role="button"
                tabIndex={0}
                aria-label={`Open ${s.title}`}
                onClick={() => onOpen(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpen(s)
                  }
                }}
                style={{ borderBottom: '1px solid var(--color-ink-850)' }}
              >
                <td style={cell}>{STATE_META[s.state].label}</td>
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
