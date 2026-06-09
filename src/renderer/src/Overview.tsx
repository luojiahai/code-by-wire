import { useMemo, type CSSProperties } from 'react'
import type { Session, ProviderCapabilities } from '@shared/types'
import type { Stats } from '@shared/stats'
import { pinWaiting } from '@shared/overview'
import { formatUsd, formatRelativeTime } from '@shared/format'
import { STATE_META, MODEL_LABEL } from './ui/meta'

const cell: CSSProperties = { padding: '6px 8px' }
const muted: CSSProperties = { ...cell, color: 'var(--color-fg-muted)' }
const numeric: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

const statsCard: CSSProperties = {
  flex: '1 1 220px',
  background: 'var(--color-ink-900)',
  border: '1px solid var(--color-ink-800)',
  borderRadius: 8,
  padding: '12px 14px',
}
const statsLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--color-fg-muted)',
  marginBottom: 8,
}
const statsRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0', fontSize: 12 }

/** Projects shown in the rollup before collapsing the rest into a "+N more" row. */
const TOP_PROJECTS = 8

interface Props {
  sessions: Session[]
  caps: ProviderCapabilities | null
  stats: Stats | null
  loading: boolean
  onRefresh: () => void
  onOpen: (session: Session) => void
  onNew: () => void
}

export function Overview({ sessions, caps, stats, loading, onRefresh, onOpen, onNew }: Props) {
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

      {stats && <StatsSection stats={stats} />}

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

/** Short UTC weekday label for a day bucket — UTC to match the UTC-day bucketing in computeStats. */
function weekdayUtc(dayStartMs: number): string {
  return new Date(dayStartMs).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}

function StatsSection({ stats }: { stats: Stats }) {
  const weekTotal = stats.weeklyActivity.reduce((sum, d) => sum + d.equivApiValueUsd, 0)
  const weekSessions = stats.weeklyActivity.reduce((n, d) => n + d.sessions, 0)
  // Bars track daily Equivalent API value so the chart measures the same thing as its dollar headline.
  const maxValue = Math.max(0, ...stats.weeklyActivity.map((d) => d.equivApiValueUsd))

  return (
    <section style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
      <div style={statsCard}>
        <div style={statsLabel}>Activity · last 7 days</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>~{formatUsd(weekTotal)}</div>
        <div
          role="img"
          aria-label={`Activity over the last 7 days: ${weekSessions} session${weekSessions === 1 ? '' : 's'}, ~${formatUsd(weekTotal)} equivalent API value`}
          style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 40, marginTop: 10 }}
        >
          {stats.weeklyActivity.map((d) => (
            <div
              key={d.dayStartMs}
              title={`${weekdayUtc(d.dayStartMs)}: ${d.sessions} session${d.sessions === 1 ? '' : 's'} · ~${formatUsd(d.equivApiValueUsd)}`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}
            >
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <div
                  style={{
                    width: '100%',
                    height: `${maxValue > 0 ? (d.equivApiValueUsd / maxValue) * 100 : 0}%`,
                    minHeight: d.sessions > 0 ? 2 : 0,
                    background: 'var(--color-primary)',
                    borderRadius: 2,
                  }}
                />
              </div>
              <span style={{ fontSize: 10, color: 'var(--color-fg-faint)' }}>{weekdayUtc(d.dayStartMs)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={statsCard}>
        <div style={statsLabel}>Model mix · last 7 days</div>
        {stats.modelMix.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--color-fg-faint)' }}>No usage yet.</span>
        ) : (
          stats.modelMix.map((m) => (
            <div key={m.model} style={statsRow}>
              <span>{MODEL_LABEL[m.model]}</span>
              <span style={{ color: 'var(--color-fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {m.sessions} · ~{formatUsd(m.equivApiValueUsd)}
              </span>
            </div>
          ))
        )}
      </div>

      <div style={statsCard}>
        <div style={statsLabel}>By project · last 7 days</div>
        {stats.projectRollup.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--color-fg-faint)' }}>No usage yet.</span>
        ) : (
          <>
            {stats.projectRollup.slice(0, TOP_PROJECTS).map((p) => (
              <div key={p.project} style={statsRow}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.project}</span>
                <span style={{ color: 'var(--color-fg-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {p.sessions} · ~{formatUsd(p.equivApiValueUsd)}
                </span>
              </div>
            ))}
            {stats.projectRollup.length > TOP_PROJECTS && (
              <div style={{ ...statsRow, color: 'var(--color-fg-faint)' }}>
                +{stats.projectRollup.length - TOP_PROJECTS} more
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
