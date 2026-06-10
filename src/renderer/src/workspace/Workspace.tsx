import type { Session, Account } from '@shared/types'
import { ManagementChip, StateBadge } from '../ui/atoms'
import { MODEL_LABEL } from '../ui/meta'
import { RateLimits } from '../ui/RateLimits'
import { TranscriptView } from './TranscriptView'
import { TerminalView } from '../terminal/TerminalView'
import { useTranscript } from './use-transcript'
import { ContextPanel } from './panels/ContextPanel'
import { CostPanel } from './panels/CostPanel'
import { Timeline } from './panels/Timeline'

export function Workspace({ session: s, account, onBack }: { session: Session; account: Account | null; onBack: () => void }) {
  const isObserved = s.management === 'observed'
  // Recomputed each render; App's 3s background re-sync re-renders this, so the countdowns tick.
  const now = Date.now()
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
        <RateLimits account={account} now={now} variant="compact" />
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
          <ObservedBody session={s} account={account} now={now} />
        ) : (
          <div className="h-full p-2">
            <TerminalView sessionId={s.id} />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The Observed workspace body: a center column (the rendered transcript, scrolling, with the turn
 * timeline as a lower panel) and a right rail of read-only panels (context breakdown + cost). One
 * transcript poll (useTranscript) feeds the transcript view, the context panel, and the timeline; the
 * cost panel reads the Session directly. The rail hides below the `lg` breakpoint, like the Overview's.
 */
function ObservedBody({ session: s, account, now }: { session: Session; account: Account | null; now: number }) {
  const doc = useTranscript(s.id)
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <TranscriptView doc={doc} project={s.project} state={s.state} />
        </div>
        <Timeline turns={doc?.turns ?? []} now={now} />
      </div>
      <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-ink-800 bg-ink-925 p-4 lg:flex">
        <ContextPanel context={doc?.context ?? null} contextWindow={s.contextWindow} />
        <CostPanel usage={s.usage} model={s.model} liveCostUsd={s.liveCostUsd} billingMode={account?.billingMode} />
      </aside>
    </div>
  )
}
