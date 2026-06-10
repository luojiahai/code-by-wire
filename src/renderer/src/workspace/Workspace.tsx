import { useState } from 'react'
import type { Session, Account } from '@shared/types'
import { cx, ManagementChip, StateBadge } from '../ui/atoms'
import { Icon } from '../ui/icons'
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
  onAdopt,
}: {
  session: Session
  account: Account | null
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
      // Always clear busy: the button is hidden after a successful adopt, but a session that later Ends
      // reverts to Observed/Ended and the button returns — a stuck flag would wedge it on "Adopting…".
      setAdoptBusy(false)
    }
  }
  // Recomputed each render; App's 3s background re-sync re-renders this, so the countdowns tick.
  const now = Date.now()
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-ink-950 text-fg">
      <header className="flex shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-925 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="truncate text-sm font-semibold text-fg">{s.title}</span>
            <StateBadge state={s.state} />
          </div>
          <div className="truncate font-mono text-[11px] text-fg-faint">
            {s.project}
            {s.branch && ` · ${s.branch}`}
          </div>
        </div>
        <ManagementChip kind={s.management} />
        {isObserved && (
          <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-faint ring-1 ring-ink-800">
            read-only
          </span>
        )}
        {canAdopt && (
          <div className="flex items-center gap-2">
            {adoptError && <span className="text-[11px] text-danger">{adoptError}</span>}
            <button
              onClick={() => void handleAdopt()}
              disabled={adoptBusy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-ink-950 ring-1 ring-primary/40 transition-colors enabled:hover:bg-primary-bright disabled:opacity-40"
            >
              <Icon name="git-pull-request-arrow" size={13} />
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
 * The workspace body: a center column (the live view with the turn timeline below it) and a right rail
 * of telemetry panels. One transcript poll (useTranscript) feeds the center, the context panel, and the
 * timeline; the cost panel reads the Session directly. The rail hides below `lg`.
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

/** The center column's live view, dispatched by management kind. Observed = read-only transcript;
 *  Managed gets the Terminal ⇄ Transcript toggle. */
function CenterView({ session: s, doc }: { session: Session; doc: DocState }) {
  if (s.management === 'observed') return <RenderedTranscript session={s} doc={doc} />
  return <ManagedCenter session={s} doc={doc} />
}

/** A Managed session has both a live terminal and the transcript the CLI is writing, so it toggles
 *  between them — default Terminal. Toggling away only detaches xterm (the pty keeps buffering), so
 *  toggling back restores full scrollback. */
function ManagedCenter({ session: s, doc }: { session: Session; doc: DocState }) {
  const [tab, setTab] = useState<CenterTab>('terminal')
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewTabs tab={tab} onChange={setTab} />
      <div className="min-h-0 flex-1">
        {tab === 'terminal' ? (
          <div className="h-full p-2.5">
            <TerminalView sessionId={s.id} />
          </div>
        ) : (
          <RenderedTranscript session={s} doc={doc} />
        )}
      </div>
    </div>
  )
}

/** The scrolling transcript, shared by the Observed center and the Managed Transcript tab. */
function RenderedTranscript({ session: s, doc }: { session: Session; doc: DocState }) {
  return (
    <div className="h-full overflow-auto">
      <TranscriptView doc={doc} project={s.project} state={s.state} readOnly={s.management === 'observed'} />
    </div>
  )
}

const CENTER_TABS: { id: CenterTab; label: string; icon: 'square-terminal' | 'messages-square' }[] = [
  { id: 'terminal', label: 'Terminal', icon: 'square-terminal' },
  { id: 'transcript', label: 'Transcript', icon: 'messages-square' },
]

/** The segmented Terminal/Transcript control: a well-track pill with the active tab raised. */
function ViewTabs({ tab, onChange }: { tab: CenterTab; onChange: (t: CenterTab) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-925 px-3 py-2">
      <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-800 bg-well p-0.5">
        {CENTER_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            aria-pressed={tab === t.id}
            className={cx(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] transition-colors',
              tab === t.id ? 'bg-ink-900 font-semibold text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            <Icon name={t.icon} size={13} />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
