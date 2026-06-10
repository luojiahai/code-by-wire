import { useState } from 'react'
import type { Session, Account } from '@shared/types'
import { cx, ManagementChip, StateBadge } from '../ui/atoms'
import { RateLimits } from '../ui/RateLimits'
import { TranscriptView } from './TranscriptView'
import { TerminalView } from '../terminal/TerminalView'
import { useTranscript, type DocState } from './use-transcript'
import { ContextPanel } from './panels/ContextPanel'
import { SessionPanel } from './panels/SessionPanel'
import { CostPanel } from './panels/CostPanel'
import { Timeline } from './panels/Timeline'
import { TasksPanel } from './panels/TasksPanel'
import { SubagentTree } from './panels/SubagentTree'
import { useTasks } from './use-tasks'

export function Workspace({
  session: s,
  account,
  onBack,
  onAdopt,
}: {
  session: Session
  account: Account | null
  onBack: () => void
  onAdopt: (id: string) => Promise<void>
}) {
  const isObserved = s.management === 'observed'
  const [adoptBusy, setAdoptBusy] = useState(false)
  const [adoptError, setAdoptError] = useState<string | null>(null)
  const canAdopt = s.management === 'observed' && s.state === 'ended'
  async function handleAdopt() {
    setAdoptBusy(true)
    setAdoptError(null)
    try {
      await onAdopt(s.id)
    } catch (e) {
      setAdoptError(e instanceof Error ? e.message : 'Failed to resume')
    } finally {
      // Always clear busy. The button is hidden right after a successful adopt (the override flips the
      // row to Managed), but if that adopted session later Ends it reverts to Observed/Ended and the
      // button returns; a stuck busy flag would wedge it on "Adopting…".
      setAdoptBusy(false)
    }
  }
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
        <RateLimits account={account} now={now} />
        <ManagementChip kind={s.management} />
        {isObserved && (
          <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-faint">
            read-only
          </span>
        )}
        {canAdopt && (
          <div className="flex items-center gap-2">
            {adoptError && <span className="text-[11px] text-danger">{adoptError}</span>}
            <button
              onClick={() => void handleAdopt()}
              disabled={adoptBusy}
              className="rounded-md bg-primary/20 px-2.5 py-1 text-[12px] text-primary-bright ring-1 ring-primary/30 enabled:hover:bg-primary/30 disabled:opacity-40"
            >
              {adoptBusy ? 'Adopting…' : 'Adopt'}
            </button>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1">
        <WorkspaceBody session={s} account={account} now={now} />
      </div>
    </div>
  )
}

/**
 * The workspace body, shared by both management kinds: a center column (the live view, with the turn
 * timeline as a lower panel) and a right rail of panels (context breakdown + cost). One transcript poll
 * (useTranscript) feeds the center, the context panel, and the timeline — Managed sessions are spawned
 * with `--session-id <our id>`, so the CLI writes the same transcript Observed sessions are read from,
 * and the panels track it live as you drive the terminal. The cost panel reads the Session directly. The
 * rail hides below the `lg` breakpoint, like the Overview's.
 */
function WorkspaceBody({ session: s, account, now }: { session: Session; account: Account | null; now: number }) {
  const doc = useTranscript(s.id)
  const tasks = useTasks(s.id)
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <CenterView session={s} doc={doc} />
        </div>
        <Timeline turns={doc?.turns ?? []} now={now} />
      </div>
      <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-ink-800 bg-ink-925 p-4 lg:flex">
        <SessionPanel session={s} />
        <ContextPanel live={s.liveContext ?? null} context={doc?.context ?? null} contextPct={s.contextPct} contextWindow={s.contextWindow} />
        <CostPanel usage={s.usage} model={s.model} liveCostUsd={s.liveCostUsd} billingMode={account?.billingMode} />
        <TasksPanel tasks={tasks ?? []} />
        <SubagentTree subagents={doc?.subagents ?? []} />
      </aside>
    </div>
  )
}

type CenterTab = 'terminal' | 'transcript'

/**
 * The center column's live view, dispatched by management kind. An Observed session is read-only with no
 * process, so it's the rendered transcript, full stop. A Managed session gets ManagedCenter's toggle.
 */
function CenterView({ session: s, doc }: { session: Session; doc: DocState }) {
  if (s.management === 'observed') return <RenderedTranscript session={s} doc={doc} />
  return <ManagedCenter session={s} doc={doc} />
}

/**
 * A Managed session has both a live terminal (the interactive surface) and the transcript the CLI is
 * writing, so it gets a toggle between them — default Terminal. Toggling away unmounts TerminalView, which
 * only detaches its xterm (the store keeps the instance and its pty keeps buffering off-DOM), so toggling
 * back restores full scrollback. Same trick as switching session tabs.
 */
function ManagedCenter({ session: s, doc }: { session: Session; doc: DocState }) {
  const [tab, setTab] = useState<CenterTab>('terminal')
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewTabs tab={tab} onChange={setTab} />
      <div className="min-h-0 flex-1">
        {tab === 'terminal' ? (
          <div className="h-full p-2">
            <TerminalView sessionId={s.id} />
          </div>
        ) : (
          <RenderedTranscript session={s} doc={doc} />
        )}
      </div>
    </div>
  )
}

/** The scrolling transcript, shared by the Observed center and the Managed Transcript tab. The read-only
 *  banner only shows for Observed (a Managed session is driven through its terminal). */
function RenderedTranscript({ session: s, doc }: { session: Session; doc: DocState }) {
  return (
    <div className="h-full overflow-auto">
      <TranscriptView doc={doc} project={s.project} state={s.state} readOnly={s.management === 'observed'} />
    </div>
  )
}

const CENTER_TABS: CenterTab[] = ['terminal', 'transcript']

function ViewTabs({ tab, onChange }: { tab: CenterTab; onChange: (t: CenterTab) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-ink-800 bg-ink-925 px-2 py-1.5">
      {CENTER_TABS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          aria-pressed={tab === t}
          className={cx(
            'rounded px-2 py-0.5 text-xs capitalize transition-colors',
            tab === t ? 'bg-ink-800 text-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
