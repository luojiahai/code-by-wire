import { useMemo } from "react";
import type { Subagent } from "@shared/types";
import { formatDuration, formatTokensShort } from "@shared/format";
import { cx } from "../../ui/atoms";
import { FAMILY_LABEL } from "../../ui/meta";
import { EmptyState } from "./chrome";
import { flattenSubagents } from "./dock-tabs";
import { DOCK_GUTTER, DockRow, MetricCell, MetricRack } from "./dock-row";

/** Per-status glyph + tone. Working pulses via its bright tone; done stays calm so working (blue) and
 *  failed (red) read as the states worth acting on. */
const STATUS_META: Record<Subagent["status"], { char: string; tone: string }> =
  {
    working: { char: "◐", tone: "text-working-bright" },
    done: { char: "✓", tone: "text-(--ui-text-secondary)" },
    failed: { char: "✕", tone: "text-danger" },
  };

/** One Subagent as a plain list row: a status glyph, the label (description, falling back to the type,
 *  with a small type tag when the description owns the label), and a right-aligned metric rack (model,
 *  tokens, tool count, duration). A working row's duration ticks live off `now`; a finished row shows
 *  its measured span. Clicking drills into the subagent's transcript. */
function SubagentRow({
  agent,
  now,
  active,
  onDrill,
}: {
  agent: Subagent;
  now: number;
  active: boolean;
  onDrill: (agent: Subagent) => void;
}) {
  const meta = STATUS_META[agent.status];
  const elapsed =
    agent.status === "working" && agent.startMs !== undefined
      ? now - agent.startMs
      : agent.durationMs;
  const primary = agent.description ?? agent.type;
  const tag = agent.description ? agent.type : null;
  return (
    <DockRow
      active={active}
      onClick={() => onDrill(agent)}
      aria-label={`Drill into ${agent.type} subagent`}
      leading={
        <span
          className={cx(
            DOCK_GUTTER,
            "shrink-0 text-center font-mono text-meta",
            meta.tone,
          )}
        >
          {meta.char}
        </span>
      }
      trailing={
        <MetricRack>
          <MetricCell width="w-10">
            {agent.model ? FAMILY_LABEL[agent.model] : "—"}
          </MetricCell>
          <MetricCell
            width="w-22"
            tone="text-(--ui-text-secondary)"
            unit="tokens"
          >
            {formatTokensShort(agent.tokens)}
          </MetricCell>
          <MetricCell
            width="w-14"
            unit={agent.toolCount === 1 ? "tool" : "tools"}
            aria-label={`${agent.toolCount} tool ${agent.toolCount === 1 ? "call" : "calls"}`}
          >
            {agent.toolCount}
          </MetricCell>
          <MetricCell width="w-12" tone="text-(--ui-text-secondary)">
            {formatDuration(elapsed)}
          </MetricCell>
        </MetricRack>
      }
    >
      {tag && (
        <span className="shrink-0 rounded-sm bg-(--ui-bg-tertiary) px-1 py-px font-mono text-micro text-(--ui-text-tertiary)">
          {tag}
        </span>
      )}
      <span
        className="min-w-0 flex-1 truncate text-aux text-(--ui-text-primary)"
        title={primary}
      >
        {primary}
      </span>
    </DockRow>
  );
}

/**
 * The Activity dock's Subagents tab: a plain flat list of every subagent (the forest flattened
 * depth-first, each parent before its subtree, oldest dispatch first), one row each with its status,
 * label, and metrics. No dispatch-batch grouping and no Gantt timeline. Shows an empty state until the
 * session spawns a subagent.
 */
export function SubagentsTab({
  subagents,
  now,
  activeAgentId,
  onDrill,
}: {
  subagents: Subagent[];
  now: number;
  activeAgentId?: string;
  onDrill: (agent: Subagent) => void;
}) {
  const lanes = useMemo(() => flattenSubagents(subagents), [subagents]);
  if (subagents.length === 0) return <EmptyState>No subagents yet.</EmptyState>;
  return (
    <div role="list" className="py-1">
      {lanes.map((a) => (
        <SubagentRow
          key={a.id}
          agent={a}
          now={now}
          active={a.id === activeAgentId}
          onDrill={onDrill}
        />
      ))}
    </div>
  );
}
