import type { Session } from '@shared/types'
import { groupSessions } from '@shared/overview'
import { formatRelativeTime } from '@shared/format'
import { cx, Dot, ManagementChip } from './ui/atoms'
import { Icon } from './ui/icons'
import { MODEL_SHORT, STATE_META, ctxTone, honestModelLabel } from './ui/meta'

/**
 * The master rail: every session grouped by state (Waiting → Working → Idle → Ended) with sticky group
 * headers and counts, narrowed by a filter box. Rows are real <button>s, so the list is keyboard- and
 * screen-reader-navigable. Selecting a row opens it in the detail pane to the right.
 */
export function SessionList({
  sessions,
  selectedId,
  onSelect,
  query,
  onQuery,
}: {
  sessions: Session[]
  selectedId: string | null
  onSelect: (id: string) => void
  query: string
  onQuery: (q: string) => void
}) {
  // One timestamp per render for the relative-time labels; the 3s background re-sync re-renders.
  const now = Date.now()
  const groups = groupSessions(sessions, query)
  return (
    <aside className="flex w-[332px] shrink-0 flex-col border-r border-ink-800 bg-ink-925">
      <div className="shrink-0 border-b border-ink-800 p-3">
        <div className="flex h-8 items-center gap-2 rounded-md border border-ink-700 bg-well px-2.5">
          <Icon name="search" size={14} className="shrink-0 text-fg-faint" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Filter sessions…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-faint"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="px-4 py-5 text-[12px] text-fg-faint">No sessions match "{query}".</p>
        ) : (
          groups.map((g) => (
            <div key={g.state}>
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-850 bg-ink-900 px-3.5 py-1.5">
                <Dot state={g.state} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                  {STATE_META[g.state].label}
                </span>
                <span className="font-mono text-[10px] text-fg-faint">{g.items.length}</span>
              </div>
              {g.items.map((s) => (
                <SessionRow key={s.id} session={s} selected={s.id === selectedId} now={now} onSelect={() => onSelect(s.id)} />
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}

function SessionRow({ session: s, selected, now, onSelect }: { session: Session; selected: boolean; now: number; onSelect: () => void }) {
  const waiting = s.state === 'waiting'
  const projectLine = s.branch ? `${s.project} · ${s.branch}` : s.project
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Open ${s.title}`}
      className={cx(
        'block w-full border-b border-l-2 border-ink-850 px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-l-primary bg-ink-850'
          : waiting
            ? 'border-l-accent bg-accent/[0.06] hover:bg-ink-900'
            : 'border-l-transparent hover:bg-ink-900',
      )}
    >
      <div className="flex items-center gap-2">
        <Dot state={s.state} />
        <span className={cx('min-w-0 flex-1 truncate text-[13px] text-fg', selected ? 'font-semibold' : 'font-medium')} title={s.title}>
          {s.title}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">{formatRelativeTime(s.lastActivityMs, now)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 pl-4">
        <ManagementChip kind={s.management} />
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-fg-faint" title={projectLine}>
          {projectLine}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-fg-muted">
          {honestModelLabel(s.model, s.modelId, s.modelDisplayName, MODEL_SHORT)}
        </span>
        <span className={cx('shrink-0 font-mono text-[10px] tabular-nums', ctxTone(s.contextPct))}>{s.contextPct}%</span>
      </div>
      {waiting && (
        <div className="ml-4 mt-1.5 truncate text-[11px] text-accent-bright" title={s.waitingReason ?? 'Waiting on you'}>
          ⚠ {s.waitingReason ?? 'Waiting on you'}
        </div>
      )}
    </button>
  )
}
