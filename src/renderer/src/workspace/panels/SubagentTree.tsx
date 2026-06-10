import type { Subagent } from '@shared/types'
import { formatDuration, formatTokens } from '@shared/format'
import { cx } from '../../ui/atoms'
import { MODEL_SHORT } from '../../ui/meta'
import { PanelSection, PanelHeading } from './chrome'

const GLYPH: Record<Subagent['status'], string> = { working: '◐', done: '✓', failed: '✕' }
const GLYPH_TONE: Record<Subagent['status'], string> = {
  working: 'text-primary-bright',
  done: 'text-fg-muted',
  failed: 'text-accent-bright',
}

/** Count a forest's nodes, children included — the panel's header tally. */
function countAgents(nodes: Subagent[]): number {
  return nodes.reduce((n, a) => n + 1 + (a.children ? countAgents(a.children) : 0), 0)
}

/** One subagent row plus its nested children, indented by depth. */
function AgentNode({ agent, depth }: { agent: Subagent; depth: number }) {
  return (
    <li>
      <div className="flex items-baseline gap-2" style={{ paddingLeft: depth * 12 }}>
        <span className={cx('shrink-0 font-mono text-[11px]', GLYPH_TONE[agent.status])}>{GLYPH[agent.status]}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-fg" title={agent.type}>
          {agent.type}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">
          {agent.model ? MODEL_SHORT[agent.model] : '—'}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-muted">{formatTokens(agent.tokens)}</span>
        <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-faint">
          {formatDuration(agent.durationMs)}
        </span>
      </div>
      {agent.children && agent.children.length > 0 && (
        <ul className="mt-1 space-y-1">
          {agent.children.map((c) => (
            <AgentNode key={c.id} agent={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** The subagent tree: who spawned whom, each node with type, status, tokens, and duration. Hidden when
 *  the session spawned no subagents. */
export function SubagentTree({ subagents }: { subagents: Subagent[] }) {
  if (subagents.length === 0) return null
  return (
    <PanelSection>
      <div className="flex items-baseline justify-between gap-2">
        <PanelHeading>Subagents</PanelHeading>
        <span className="font-mono text-[10px] tabular-nums text-fg-faint">{countAgents(subagents)}</span>
      </div>
      <ul className="space-y-1">
        {subagents.map((a) => (
          <AgentNode key={a.id} agent={a} depth={0} />
        ))}
      </ul>
    </PanelSection>
  )
}
