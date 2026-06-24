import type { WorkflowPhase } from "@shared/types";
import { cx } from "../../ui/atoms";

/** One phase segment, lit in teal once it has work: done is a solid deep-teal bar, the running phase
 *  fills in the brighter brand teal and pulses (fill proportional to agents finished), pending is dim. */
function Segment({ phase }: { phase: WorkflowPhase }) {
  const { status, agentsDone, agentsTotal } = phase;
  const fillPct =
    agentsTotal > 0 ? Math.round((agentsDone / agentsTotal) * 100) : 0;
  return (
    <div
      className={cx(
        "relative h-2 flex-1 overflow-hidden rounded-full",
        status === "done"
          ? "bg-primary-deep"
          : status === "running"
            ? "bg-ink-700"
            : "bg-ink-850",
      )}
    >
      {status === "running" && (
        <div
          className="absolute inset-y-0 left-0 animate-pulse-soft rounded-full bg-primary"
          style={{ width: `${fillPct}%` }}
        />
      )}
    </div>
  );
}

/** One phase label below its segment, with a glyph + agent tally for the active phase. */
function Label({ phase }: { phase: WorkflowPhase }) {
  const tone =
    phase.status === "done"
      ? "text-fg-muted"
      : phase.status === "running"
        ? "text-primary"
        : "text-fg-faint";
  return (
    <span className={cx("flex-1 truncate text-center text-[10px]", tone)}>
      {phase.status === "done" ? "✓ " : ""}
      {phase.title}
      {phase.status === "running" && phase.agentsTotal > 0
        ? ` ${phase.agentsDone}/${phase.agentsTotal}`
        : ""}
    </span>
  );
}

/** The run's phase strip: one stateful segment per phase, labels beneath. Two segments can read running
 *  at once (streaming pipelines overlap) — that's intentional and truthful. */
export function PhaseStrip({ phases }: { phases: WorkflowPhase[] }) {
  if (phases.length === 0) return null;
  return (
    <div className="px-3 pb-2 pt-1">
      <div className="flex gap-1.5">
        {phases.map((p) => (
          <Segment key={p.index} phase={p} />
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {phases.map((p) => (
          <Label key={p.index} phase={p} />
        ))}
      </div>
    </div>
  );
}
