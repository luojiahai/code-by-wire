import { useMemo } from "react";
import type { Subagent } from "@shared/types";
import { formatDuration, formatTokens } from "@shared/format";
import { Bar, cx } from "../../ui/atoms";
import { ratePct } from "../../ui/charts-geom";
import { FAMILY_LABEL } from "../../ui/meta";
import { maxSubagentDuration, type SubagentStats } from "./dock-tabs";
import { EmptyState } from "./chrome";

const GLYPH: Record<Subagent["status"], string> = {
  working: "◐",
  done: "✓",
  failed: "✕",
};

/** Per-status lane styling. Working is teal and pulses (live, the straggler to watch); Done recedes to
 *  slate (the bulk of a finished fan-out); Failed flares red (jump straight to what went wrong). Three
 *  distinct colours so the swarm's shape — long pole, stragglers, failures — reads at a glance. */
const STATUS_META: Record<
  Subagent["status"],
  { tone: string; fill: string; pulse: boolean }
> = {
  working: { tone: "text-working-bright", fill: "bg-working", pulse: true },
  done: { tone: "text-fg-muted", fill: "bg-idle", pulse: false },
  failed: { tone: "text-danger", fill: "bg-danger", pulse: false },
};

/** A working lane with little duration yet still gets a visible, pulsing sliver so a just-spawned agent
 *  reads as alive rather than as an empty bar. */
const WORKING_MIN_PCT = 4;

/** One subagent lane plus its nested children, indented by depth. The bar is sized by duration relative
 *  to the longest lane in the fan-out; a Working lane's bar pulses and grows as the session re-polls. */
function AgentLane({
  agent,
  depth,
  maxDurationMs,
}: {
  agent: Subagent;
  depth: number;
  maxDurationMs: number;
}) {
  const meta = STATUS_META[agent.status];
  const pct = ratePct(agent.durationMs, maxDurationMs);
  const barPct =
    agent.status === "working" ? Math.max(pct, WORKING_MIN_PCT) : pct;
  return (
    <li>
      <div
        className="flex items-center gap-2"
        style={{ paddingLeft: depth * 12 }}
      >
        <span
          className={cx(
            "shrink-0 font-mono text-[11px]",
            meta.tone,
            meta.pulse && "animate-pulse-soft",
          )}
        >
          {GLYPH[agent.status]}
        </span>
        <span
          className="w-28 shrink-0 truncate text-[12px] text-fg"
          title={agent.type}
        >
          {agent.type}
        </span>
        <Bar
          pct={barPct}
          fill={cx(meta.fill, meta.pulse && "animate-pulse-soft")}
          className="min-w-0 flex-1"
        />
        <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-faint">
          {agent.model ? FAMILY_LABEL[agent.model] : "—"}
        </span>
        <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-muted">
          {formatTokens(agent.tokens)}
        </span>
        <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-faint">
          {formatDuration(agent.durationMs)}
        </span>
      </div>
      {agent.children && agent.children.length > 0 && (
        <ul className="mt-1 space-y-1">
          {agent.children.map((c) => (
            <AgentLane
              key={c.id}
              agent={c}
              depth={depth + 1}
              maxDurationMs={maxDurationMs}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** A running/done/failed chip in the tally header: a status-toned glyph and count. */
function TallyChip({
  status,
  count,
}: {
  status: Subagent["status"];
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cx("font-mono text-[10px]", STATUS_META[status].tone)}>
        {GLYPH[status]}
      </span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}

/**
 * The Structure dock's Subagents tab: a live lane timeline of the session's subagent fan-out. Each
 * subagent is a lane with its type, status, model, tokens, and duration, plus a bar sized by duration
 * (the longest lane reads full, the rest scale to it). Working lanes pulse and their bars grow as the
 * session re-polls; Done and Failed are distinct by colour. A running/done/failed tally pins to the top,
 * and the list scrolls for a large fan-out. Shows an empty state until the session spawns a subagent.
 */
export function SubagentsTab({
  subagents,
  stats,
}: {
  subagents: Subagent[];
  stats: SubagentStats;
}) {
  const maxDurationMs = useMemo(
    () => maxSubagentDuration(subagents),
    [subagents],
  );
  if (subagents.length === 0) return <EmptyState>No subagents yet.</EmptyState>;
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-ink-800 bg-ink-925 px-4 py-1.5 font-mono text-[10px] text-fg-muted">
        <TallyChip status="working" count={stats.working} />
        <TallyChip status="done" count={stats.done} />
        <TallyChip status="failed" count={stats.failed} />
      </div>
      <ul className="space-y-1 px-4 py-3">
        {subagents.map((a) => (
          <AgentLane
            key={a.id}
            agent={a}
            depth={0}
            maxDurationMs={maxDurationMs}
          />
        ))}
      </ul>
    </div>
  );
}
