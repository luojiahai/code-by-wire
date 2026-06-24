import type { WorkflowRunSummary } from "@shared/types";
import { formatDuration } from "@shared/format";
import { cx } from "../../ui/atoms";

/**
 * The run's headline stats as one evenly-spaced row: agents · tokens · duration · tools. Shared by the
 * run-surface header and the dock list row so the two read identically. Each cell is a dim label with a
 * brighter value; the generous column gap keeps them from crowding.
 */
export function RunStats({
  run,
  className,
}: {
  run: WorkflowRunSummary;
  className?: string;
}) {
  const cells: { value: string; label?: string }[] = [
    { value: String(run.agentCount), label: "agents" },
    { value: `${Math.round(run.totalTokens / 1000)}k`, label: "tokens" },
    { value: formatDuration(run.durationMs) },
    { value: String(run.totalToolCalls), label: "tools" },
  ];
  return (
    <div
      className={cx(
        "flex shrink-0 items-center gap-4 font-mono text-[11px] tabular-nums",
        className,
      )}
    >
      {cells.map((c, i) => (
        <span key={i} className="text-fg-faint">
          <span className="text-fg-muted">{c.value}</span>
          {c.label ? ` ${c.label}` : ""}
        </span>
      ))}
    </div>
  );
}
