import type { Subagent } from "@shared/types";
import { formatDuration, formatTokens } from "@shared/format";
import { cx } from "../../ui/atoms";
import { FAMILY_LABEL } from "../../ui/meta";
import { EmptyState } from "./chrome";

const GLYPH: Record<Subagent["status"], string> = {
  working: "◐",
  done: "✓",
  failed: "✕",
};
const GLYPH_TONE: Record<Subagent["status"], string> = {
  working: "text-primary-bright",
  done: "text-fg-muted",
  failed: "text-danger",
};

/** One subagent row plus its nested children, indented by depth. */
function AgentNode({ agent, depth }: { agent: Subagent; depth: number }) {
  return (
    <li>
      <div
        className="flex items-baseline gap-2"
        style={{ paddingLeft: depth * 12 }}
      >
        <span
          className={cx(
            "shrink-0 font-mono text-[11px]",
            GLYPH_TONE[agent.status],
          )}
        >
          {GLYPH[agent.status]}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[12px] text-fg"
          title={agent.type}
        >
          {agent.type}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">
          {agent.model ? FAMILY_LABEL[agent.model] : "—"}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-muted">
          {formatTokens(agent.tokens)}
        </span>
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
  );
}

/**
 * The Structure dock's Subagents tab: the session's subagent forest — who spawned whom, each node with
 * type, status, model, tokens, and duration. Display-only for this slice (no lanes, sorting, or
 * drill-in). Shows an empty state until the session spawns a subagent.
 */
export function SubagentsTab({ subagents }: { subagents: Subagent[] }) {
  if (subagents.length === 0) return <EmptyState>No subagents yet.</EmptyState>;
  return (
    <ul className="space-y-1 px-4 py-3">
      {subagents.map((a) => (
        <AgentNode key={a.id} agent={a} depth={0} />
      ))}
    </ul>
  );
}
