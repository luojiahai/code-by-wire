import type { Session } from '@shared/types'
import { ManagementChip, StateBadge } from '../ui/atoms'
import { MODEL_LABEL } from '../ui/meta'
import { TranscriptView } from './TranscriptView'
import { TerminalView } from '../terminal/TerminalView'

export function Workspace({ session: s, onBack }: { session: Session; onBack: () => void }) {
  const isObserved = s.management === 'observed'
  return (
    <div className="flex h-screen flex-col bg-ink-950 text-fg">
      <header className="flex items-center gap-3 border-b border-ink-800 bg-ink-925 px-4 py-2.5">
        <button
          onClick={onBack}
          className="rounded-md px-2 py-1 text-sm text-fg-muted transition-colors hover:bg-ink-800 hover:text-fg"
        >
          ← Overview
        </button>
        <div className="h-5 w-px bg-ink-800" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-fg">{s.title}</span>
            <StateBadge state={s.state} />
          </div>
          <div className="truncate font-mono text-[11px] text-fg-faint">
            {s.project}
            {s.branch && ` · ${s.branch}`}
          </div>
        </div>
        <ManagementChip kind={s.management} />
        <span className="font-mono text-[11px] text-fg-muted">{MODEL_LABEL[s.model]}</span>
        {isObserved && (
          <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-faint">
            read-only
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1">
        {isObserved ? (
          <div className="h-full overflow-auto">
            <TranscriptView sessionId={s.id} project={s.project} state={s.state} />
          </div>
        ) : (
          <div className="h-full p-2">
            <TerminalView sessionId={s.id} />
          </div>
        )}
      </div>
    </div>
  )
}
