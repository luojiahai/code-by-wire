import type { WorkflowRunSummary } from "@shared/types";
import { formatRelativeTime } from "@shared/format";
import { cx, focusRingInset } from "../../ui/atoms";
import { EmptyState } from "./chrome";
import { RunStats } from "../workflow/RunStats";

/** A run's status glyph + tone. Running pulses; failed and completed are tone-only (state by tone, not color). */
function runGlyph(status: string): {
  char: string;
  tone: string;
  pulse: boolean;
} {
  if (status === "running") return { char: "◐", tone: "text-fg", pulse: true };
  if (status === "failed")
    return { char: "✗", tone: "text-fg-muted", pulse: false };
  return { char: "✓", tone: "text-fg-muted", pulse: false };
}

/** One workflow run as a compact, clickable row: status glyph, name, the run stats (agents/tokens/
 *  duration/tools), and a relative start. Clicking drills into the run surface in the center pane. */
function WorkflowRow({
  run,
  active,
  now,
  onDrill,
}: {
  run: WorkflowRunSummary;
  active: boolean;
  now: number;
  onDrill: (run: WorkflowRunSummary) => void;
}) {
  const glyph = runGlyph(run.status);
  return (
    <button
      type="button"
      onClick={() => onDrill(run)}
      aria-label={`Open workflow run ${run.workflowName}`}
      className={cx(
        "flex w-full items-center gap-2 rounded-sm border-b border-ink-850 px-2 py-1.5 text-left transition-colors",
        focusRingInset,
        active ? "bg-ink-850" : "hover:bg-ink-900",
      )}
    >
      <span
        className={cx(
          "w-3 shrink-0 text-center font-mono text-[11px]",
          glyph.tone,
          glyph.pulse && "animate-pulse-soft",
        )}
      >
        {glyph.char}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[12px]"
        title={run.workflowName}
      >
        <span className="text-fg">{run.workflowName}</span>
        {run.args ? <span className="text-fg-faint"> {run.args}</span> : null}
      </span>
      <RunStats run={run} />
      {run.startMs > 0 && (
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">
          {formatRelativeTime(run.startMs, now)}
        </span>
      )}
    </button>
  );
}

/**
 * The Structure dock's Workflows tab: a compact list of every workflow run the session launched, newest
 * first. View-only — clicking a row drills into the run surface in the center pane. Empty until the
 * session runs a workflow.
 */
export function WorkflowsTab({
  workflows,
  now,
  activeWorkflowId,
  onDrill,
}: {
  workflows: WorkflowRunSummary[];
  now: number;
  activeWorkflowId?: string;
  onDrill: (run: WorkflowRunSummary) => void;
}) {
  if (workflows.length === 0) return <EmptyState>No workflow runs.</EmptyState>;
  return (
    <div className="py-1">
      {workflows.map((r) => (
        <WorkflowRow
          key={r.runId}
          run={r}
          active={r.runId === activeWorkflowId}
          now={now}
          onDrill={onDrill}
        />
      ))}
    </div>
  );
}
