import type { TurnSummary } from '@shared/transcript'
import { formatDuration, formatRelativeTime } from '@shared/format'
import { PanelHeading } from './chrome'

/**
 * The turn-by-turn timeline: each user prompt and the assistant work it triggered, with the turn's tool
 * count, wall-clock duration, and how long ago it started. Oldest first, matching the transcript. `now`
 * comes from the parent's render clock so the relative times tick with the 3s background re-sync.
 */
export function Timeline({ turns, now }: { turns: TurnSummary[]; now: number }) {
  return (
    <div className="flex max-h-48 shrink-0 flex-col border-t border-ink-800 bg-ink-925">
      <div className="flex shrink-0 items-baseline justify-between px-4 py-2">
        <PanelHeading>Timeline</PanelHeading>
        <span className="font-mono text-[10px] text-fg-faint">
          {turns.length} turn{turns.length === 1 ? '' : 's'}
        </span>
      </div>
      {turns.length === 0 ? (
        <p className="px-4 pb-3 text-[11px] text-fg-faint">No turns yet.</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {turns.map((t) => (
            <li key={t.index} className="flex items-baseline gap-3 border-b border-ink-800/60 py-1.5 last:border-0">
              <span className="w-6 shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">{t.index}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-fg" title={t.prompt}>
                {t.prompt}
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-muted">
                {t.toolCount} tool{t.toolCount === 1 ? '' : 's'}
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-muted">
                {formatDuration(t.durationMs)}
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-faint">
                {formatRelativeTime(t.startMs, now)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
