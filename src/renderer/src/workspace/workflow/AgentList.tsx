import type { WorkflowRun, WorkflowAgent, WorkflowPhase } from "@shared/types";
import { cx, focusRingInset } from "../../ui/atoms";

/** The run's time bounds for the shared micro-timeline axis: earliest start to latest end among agents. */
function runBounds(agents: WorkflowAgent[]): { start: number; end: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const a of agents) {
    const s = a.startMs ?? a.queuedMs;
    if (s !== undefined) {
      if (s < start) start = s;
      const e = s + a.durationMs;
      if (e > end) end = e;
    }
  }
  if (!Number.isFinite(start)) return { start: 0, end: 1 };
  return { start, end: end > start ? end : start + 1 };
}

/** A single agent row: state dot, label, a micro-timeline bar positioned on the shared axis, and tokens. */
function AgentRow({
  agent,
  bounds,
  selected,
  onSelect,
}: {
  agent: WorkflowAgent;
  bounds: { start: number; end: number };
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const span = bounds.end - bounds.start;
  const s = agent.startMs ?? agent.queuedMs;
  const leftPct = s !== undefined ? ((s - bounds.start) / span) * 100 : 0;
  const widthPct =
    s !== undefined ? Math.max(2, (agent.durationMs / span) * 100) : 0;
  const running = agent.state === "running";
  const dotTone = running
    ? "bg-fg animate-pulse-soft"
    : agent.state === "queued"
      ? "bg-ink-600"
      : "bg-fg-muted";
  return (
    <button
      type="button"
      onClick={() => onSelect(agent.id)}
      aria-label={`Open transcript for ${agent.label}`}
      className={cx(
        "flex w-full items-center gap-2 px-3 py-1 text-left transition-colors",
        focusRingInset,
        selected
          ? "bg-ink-850 shadow-[inset_2px_0_0] shadow-fg-muted"
          : "hover:bg-ink-900",
      )}
    >
      <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", dotTone)} />
      <span
        className="w-28 shrink-0 truncate text-[11px] text-fg-muted"
        title={agent.label}
      >
        {agent.label}
      </span>
      <span className="relative h-1.5 flex-1 rounded-full bg-ink-900">
        {s !== undefined && (
          <span
            className={cx(
              "absolute inset-y-0 rounded-full bg-fg-muted",
              running && "animate-pulse-soft",
            )}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          />
        )}
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-faint">
        {Math.round(agent.tokens / 1000)}k
      </span>
    </button>
  );
}

/** A collapsible-looking phase group header with its agent tally. */
function PhaseGroup({
  phase,
  agents,
  bounds,
  selectedAgentId,
  onSelectAgent,
}: {
  phase: WorkflowPhase;
  agents: WorkflowAgent[];
  bounds: { start: number; end: number };
  selectedAgentId?: string;
  onSelectAgent: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 border-t border-ink-850 px-3 py-1">
        <span className="text-[11px] font-semibold text-fg">{phase.title}</span>
        <span className="font-mono text-[10px] tabular-nums text-fg-faint">
          {phase.agentsTotal}
        </span>
      </div>
      {agents.map((a) => (
        <AgentRow
          key={a.id}
          agent={a}
          bounds={bounds}
          selected={a.id === selectedAgentId}
          onSelect={onSelectAgent}
        />
      ))}
    </div>
  );
}

/** The master pane: agents grouped by phase, each row carrying a micro-timeline bar on a shared axis so
 *  the streaming overlap survives in the list. Clicking a row selects the agent (detail pane in Task 9). */
export function AgentList({
  run,
  selectedAgentId,
  onSelectAgent,
}: {
  run: WorkflowRun;
  selectedAgentId?: string;
  onSelectAgent: (id: string) => void;
}) {
  const bounds = runBounds(run.agents);
  return (
    <div className="py-1">
      {run.phases.map((p) => {
        const agents = run.agents.filter((a) => a.phaseIndex === p.index);
        if (agents.length === 0) return null;
        return (
          <PhaseGroup
            key={p.index}
            phase={p}
            agents={agents}
            bounds={bounds}
            selectedAgentId={selectedAgentId}
            onSelectAgent={onSelectAgent}
          />
        );
      })}
    </div>
  );
}
