// PROTOTYPE — the per-session workspace (drill-down). Terminal for Managed,
// read-only rendered transcript for Observed, with shared panels around it.
import { useState } from 'react'
import type { Account, Session, Subagent, Task } from '../types'
import { MODEL_META, fmtDuration, fmtTokens, fmtUsd } from '../lib'
import { Bar, ManagementChip, ModelChip, RateLimitBar, StateBadge, cx } from '../components'

const CTX_SEG = [
  { key: 'system', label: 'System + CLAUDE.md', color: 'bg-ink-600' },
  { key: 'tools', label: 'MCP + tool defs', color: 'bg-accent/70' },
  { key: 'messages', label: 'Messages', color: 'bg-primary' },
  { key: 'files', label: 'Files', color: 'bg-primary/40' },
] as const

export function Workspace({ session: s, account, onBack }: { session: Session; account: Account; onBack: () => void }) {
  const [tab, setTab] = useState<'tasks' | 'subagents' | 'timeline'>(
    s.subagents.length ? 'subagents' : s.tasks.length ? 'tasks' : 'timeline',
  )
  const canAdopt = s.state === 'ended'
  const isObserved = s.management === 'observed'

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-ink-800 bg-ink-925 px-4 py-2.5">
        <button onClick={onBack} className="rounded-md px-2 py-1 text-sm text-fg-muted transition-colors hover:bg-ink-800 hover:text-fg">
          ← Overview
        </button>
        <div className="h-5 w-px bg-ink-800" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-fg">{s.title}</span>
            <StateBadge state={s.state} />
          </div>
          <div className="truncate font-mono text-[11px] text-fg-faint">{s.project}{s.branch && ` · ${s.branch}`}</div>
        </div>
        <ManagementChip kind={s.management} />
        <span className="font-mono text-[11px] text-fg-muted">{MODEL_META[s.model].label}</span>
        <div className="flex items-center gap-2">
          {canAdopt ? (
            <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white">⤓ Adopt — resume here</button>
          ) : isObserved ? (
            <>
              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-faint">read-only</span>
              <button className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-fg-muted hover:bg-ink-800">⑂ Fork to edit</button>
            </>
          ) : (
            <button className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-fg-muted hover:bg-ink-800">⑂ Fork</button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Center: conversation + bottom panel */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-ink-800">
          <div className="min-h-0 flex-1 overflow-auto">
            {isObserved ? <TranscriptMock s={s} /> : <TerminalMock s={s} />}
          </div>

          {/* Bottom panel */}
          <div className="h-[42%] min-h-[220px] border-t border-ink-800 bg-ink-925">
            <div className="flex items-center gap-1 border-b border-ink-800 px-3">
              {(['tasks', 'subagents', 'timeline'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cx(
                    'relative px-3 py-2 text-xs capitalize transition-colors',
                    tab === t ? 'text-fg' : 'text-fg-faint hover:text-fg-muted',
                  )}
                >
                  {t}
                  <span className="ml-1.5 font-mono text-[10px] text-fg-faint">
                    {t === 'tasks' ? s.tasks.length : t === 'subagents' ? countAgents(s.subagents) : 5}
                  </span>
                  {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
                </button>
              ))}
            </div>
            <div className="h-[calc(100%-37px)] overflow-auto p-3">
              {tab === 'tasks' && <TasksView tasks={s.tasks} />}
              {tab === 'subagents' && <SubagentsView agents={s.subagents} />}
              {tab === 'timeline' && <TimelineView s={s} />}
            </div>
          </div>
        </div>

        {/* Right rail */}
        <aside className="w-80 shrink-0 space-y-3 overflow-y-auto bg-ink-925 p-3">
          <ContextPanel s={s} />
          <CostPanel s={s} />
          <div className="rounded-lg border border-ink-800 bg-ink-900/60 p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Account limits</div>
            <div className="space-y-3">
              <RateLimitBar label="5-hour" pct={account.fiveHour.usedPct} resetsAt={account.fiveHour.resetsAt} />
              <RateLimitBar label="7-day" pct={account.sevenDay.usedPct} resetsAt={account.sevenDay.resetsAt} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-fg-faint">Account-wide, shared across all sessions.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ---------- center ---------- */

function TerminalMock({ s }: { s: Session }) {
  return (
    <div className="h-full bg-ink-950 p-4 font-mono text-[12.5px] leading-relaxed">
      <div className="text-fg-faint">➜ {s.project} git:(<span className="text-danger">{s.branch}</span>) claude</div>
      <div className="mt-2 text-fg-muted">● Thinking…</div>
      <div className="mt-1 text-fg">I'll build the three Overview variants now, then wire the switcher.</div>
      <div className="mt-2 text-primary-bright">⏺ Write(src/prototype/overview/OverviewC_TriageRail.tsx)</div>
      <div className="text-fg-faint">  ⎿  Wrote 168 lines</div>
      <div className="mt-1 text-primary-bright">⏺ Bash(pnpm dev)</div>
      <div className="text-fg-faint">  ⎿  VITE v6.0.1  ready in 412 ms</div>
      <div className="text-fg-faint">     ➜  Local: http://localhost:5180/</div>
      <div className="mt-3 flex items-center text-fg">
        <span className="text-primary">❯</span>
        <span className="ml-2 text-fg-muted">try a different layout for the hero strip</span>
        <span className="ml-0.5 inline-block h-4 w-2 cursor-blink bg-fg" />
      </div>
      <div className="mt-4 rounded-md border border-ink-800 bg-ink-900/50 px-2.5 py-1.5 text-[11px] text-fg-faint">
        Managed session — you're typing into the real CLI. Toggle a rendered conversation view (read-only) is v2.
      </div>
    </div>
  )
}

function TranscriptMock({ s }: { s: Session }) {
  const waiting = s.state === 'waiting'
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5">
      <div className="rounded-md bg-ink-800/60 px-2 py-1 text-center text-[10px] uppercase tracking-wider text-fg-faint">
        Read-only — rendered from {s.project}'s live transcript
      </div>

      <Msg role="user">{s.title}. Start with staging, show me the diff before applying.</Msg>

      <Msg role="assistant">
        <p className="text-fg">On it. I'll inventory the current subnets first, then draft a reusable module and show the plan.</p>
        <details className="mt-2 text-[11px] text-fg-faint">
          <summary className="cursor-pointer select-none">Thought for 14s</summary>
          <p className="mt-1 border-l border-ink-700 pl-2">Need to check whether the existing CIDRs overlap before modularizing…</p>
        </details>
      </Msg>

      <ToolCard name="Read" arg="modules/network/main.tf" />
      <DiffCard />
      <SubagentDispatch type="general-purpose" desc="Rewrite network module, idempotent plan" status="working" />

      {waiting ? (
        <div className="rounded-lg border border-accent/50 bg-accent/[0.08] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-bright">Waiting for you</div>
          <p className="mt-1 font-mono text-[12px] text-accent-bright">{s.waitingReason}</p>
        </div>
      ) : s.state === 'working' ? (
        <div className="flex items-center gap-2 text-[12px] text-fg-muted">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-primary" /> {s.currentTask}
        </div>
      ) : (
        <div className="text-[12px] text-fg-faint">— session {s.state} —</div>
      )}
    </div>
  )
}

function Msg({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const user = role === 'user'
  return (
    <div className={cx('flex gap-2.5', user && 'flex-row-reverse')}>
      <div className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold', user ? 'bg-ink-700 text-fg-muted' : 'bg-primary/20 text-primary-bright')}>
        {user ? 'You' : 'C'}
      </div>
      <div className={cx('max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed', user ? 'bg-ink-800 text-fg' : 'bg-ink-900/70 ring-1 ring-ink-800')}>
        {children}
      </div>
    </div>
  )
}

function ToolCard({ name, arg }: { name: string; arg: string }) {
  return (
    <div className="ml-8 flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/50 px-3 py-1.5 font-mono text-[11px]">
      <span className="text-primary-bright">⏺ {name}</span>
      <span className="truncate text-fg-faint">{arg}</span>
    </div>
  )
}

function DiffCard() {
  return (
    <div className="ml-8 overflow-hidden rounded-lg border border-ink-800 bg-ink-900/50 font-mono text-[11px]">
      <div className="border-b border-ink-800 px-3 py-1.5 text-fg-faint">⏺ Edit · modules/network/main.tf</div>
      <div className="px-3 py-1.5">
        <div className="text-danger/90">- resource "aws_subnet" "a" {'{'} cidr_block = "10.0.1.0/24" {'}'}</div>
        <div className="text-ok/90">+ module "subnets" {'{'} source = "./modules/subnet" cidrs = var.cidrs {'}'}</div>
      </div>
    </div>
  )
}

function SubagentDispatch({ type, desc, status }: { type: string; desc: string; status: string }) {
  return (
    <div className="ml-8 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2 text-[11px]">
      <span className="text-primary-bright">⛬ Subagent</span>
      <span className="font-mono text-fg">{type}</span>
      <span className="truncate text-fg-faint">— {desc}</span>
      <span className="ml-auto flex items-center gap-1 text-primary-bright">
        <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-primary" /> {status}
      </span>
    </div>
  )
}

/* ---------- right rail ---------- */

function ContextPanel({ s }: { s: Session }) {
  const b = s.contextBreakdown
  const total = b.system + b.tools + b.messages + b.files
  const used = s.contextWindow ? Math.round((total / s.contextWindow) * 100) : s.contextPct
  const toCompact = Math.max(0, Math.round(s.contextWindow * 0.92) - total)
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Context</span>
        <span className="font-mono text-xs text-fg">{used || s.contextPct}% of {fmtTokens(s.contextWindow)}</span>
      </div>
      {total > 0 ? (
        <>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-800">
            {CTX_SEG.map((seg) => (
              <div key={seg.key} className={seg.color} style={{ width: `${(b[seg.key] / s.contextWindow) * 100}%` }} />
            ))}
          </div>
          <div className="mt-2.5 space-y-1">
            {CTX_SEG.map((seg) => (
              <div key={seg.key} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-fg-muted">
                  <span className={cx('h-2 w-2 rounded-sm', seg.color)} /> {seg.label}
                </span>
                <span className="font-mono text-fg-faint">{fmtTokens(b[seg.key])}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 border-t border-ink-800 pt-2 text-[10px] text-fg-faint">
            ~{fmtTokens(toCompact)} until auto-compact
          </div>
        </>
      ) : (
        <div className="text-[11px] text-fg-faint">Session ended — context released.</div>
      )}
    </div>
  )
}

function CostPanel({ s }: { s: Session }) {
  const u = s.usage
  const cacheTotal = u.cacheReadTokens + u.cacheCreationTokens
  const savedPct = Math.round((u.cacheReadTokens / (u.cacheReadTokens + u.inputTokens)) * 100)
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Cost + tokens</span>
        <span className="font-mono text-xs text-fg-muted" title="equivalent API value">~{fmtUsd(s.equivApiValueUsd)}</span>
      </div>
      <div className="space-y-1">
        <Row k="Input" v={fmtTokens(u.inputTokens)} />
        <Row k="Output" v={fmtTokens(u.outputTokens)} />
        <Row k="Cache read" v={fmtTokens(u.cacheReadTokens)} />
        <Row k="Cache write" v={fmtTokens(u.cacheCreationTokens)} />
      </div>
      <div className="mt-2.5 rounded-md bg-primary/[0.08] px-2.5 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-primary-bright">Cache served</span>
          <span className="font-mono text-sm text-primary-bright">{savedPct}%</span>
        </div>
        <Bar pct={savedPct} fill="bg-primary" className="mt-1.5 h-1" />
        <div className="mt-1 text-[10px] text-fg-faint">{fmtTokens(cacheTotal)} from cache instead of fresh input</div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-fg-faint">{k}</span>
      <span className="font-mono text-fg">{v}</span>
    </div>
  )
}

/* ---------- bottom tabs ---------- */

const TASK_ICON: Record<Task['status'], { ch: string; cls: string }> = {
  completed: { ch: '✓', cls: 'text-ok' },
  in_progress: { ch: '◐', cls: 'text-primary-bright' },
  blocked: { ch: '⊘', cls: 'text-accent' },
  pending: { ch: '○', cls: 'text-fg-faint' },
}

function TasksView({ tasks }: { tasks: Task[] }) {
  if (!tasks.length) return <Empty>No tasks tracked in this session.</Empty>
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t.subject]))
  return (
    <ul className="space-y-1">
      {tasks.map((t) => {
        const ic = TASK_ICON[t.status]
        return (
          <li key={t.id} className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-ink-850">
            <span className={cx('mt-0.5 font-mono text-sm leading-none', ic.cls)}>{ic.ch}</span>
            <div className="min-w-0">
              <div className={cx('text-[13px]', t.status === 'completed' ? 'text-fg-faint line-through' : 'text-fg')}>{t.subject}</div>
              {t.blockedBy?.length ? (
                <div className="mt-0.5 text-[10px] text-accent/80">needs: {t.blockedBy.map((id) => byId[id]).join(', ')}</div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function countAgents(agents: Subagent[]): number {
  return agents.reduce((n, a) => n + 1 + (a.children ? countAgents(a.children) : 0), 0)
}

function SubagentsView({ agents }: { agents: Subagent[] }) {
  if (!agents.length) return <Empty>No subagents spawned.</Empty>
  return <div className="space-y-1">{agents.map((a) => <AgentNode key={a.id} a={a} depth={0} />)}</div>
}

function AgentNode({ a, depth }: { a: Subagent; depth: number }) {
  const dot = a.status === 'working' ? 'bg-primary animate-pulse-soft' : a.status === 'failed' ? 'bg-danger' : 'bg-ok'
  return (
    <>
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-ink-850" style={{ marginLeft: depth * 18 }}>
        {depth > 0 && <span className="text-ink-600">└</span>}
        <span className={cx('h-2 w-2 rounded-full', dot)} />
        <span className="font-mono text-[12px] text-fg">{a.type}</span>
        <span className="ml-auto flex items-center gap-3 font-mono text-[10px] text-fg-faint">
          <span>{fmtTokens(a.tokens)} tok</span>
          <span>{fmtDuration(a.durationMs)}</span>
          <span className={cx(a.status === 'working' ? 'text-primary-bright' : a.status === 'failed' ? 'text-danger' : 'text-ok')}>{a.status}</span>
        </span>
      </div>
      {a.children?.map((c) => <AgentNode key={c.id} a={c} depth={depth + 1} />)}
    </>
  )
}

function TimelineView({ s }: { s: Session }) {
  const turns = [
    { t: 'Prompt received', d: 0, tools: 0 },
    { t: 'Explored codebase', d: 42_000, tools: 6 },
    { t: 'Drafted plan', d: 18_000, tools: 1 },
    { t: 'Dispatched subagents', d: 175_000, tools: 3 },
    { t: s.state === 'waiting' ? 'Asked for input' : 'Editing files', d: 64_000, tools: 12 },
  ]
  return (
    <div className="space-y-0">
      {turns.map((turn, i) => (
        <div key={i} className="flex items-center gap-3 border-l border-ink-800 py-1.5 pl-3">
          <span className="-ml-[18px] h-2 w-2 rounded-full bg-ink-600 ring-2 ring-ink-925" />
          <span className="flex-1 text-[12px] text-fg">{turn.t}</span>
          <span className="font-mono text-[10px] text-fg-faint">{turn.tools} tools</span>
          <span className="w-16 text-right font-mono text-[10px] text-fg-muted">{turn.d ? fmtDuration(turn.d) : '—'}</span>
        </div>
      ))}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-[12px] text-fg-faint">{children}</div>
}
