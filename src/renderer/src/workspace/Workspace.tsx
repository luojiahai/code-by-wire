import type { Session } from '@shared/types'
import { ManagementChip, StateBadge } from '../ui/atoms'
import { MODEL_LABEL } from '../ui/meta'
import { TranscriptView } from './TranscriptView'

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

      <div className="min-h-0 flex-1 overflow-auto">
        {isObserved ? (
          <TranscriptView sessionId={s.id} project={s.project} state={s.state} />
        ) : (
          <ManagedPlaceholder />
        )}
      </div>
    </div>
  )
}

function ManagedPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-[13px]">
      <div>
        <div className="text-fg">Managed session</div>
        <p className="mt-2 max-w-sm text-fg-faint">
          The live terminal for Managed sessions lands in a later slice. This workspace currently covers the frame
          and the Observed read-only transcript.
        </p>
      </div>
    </div>
  )
}
