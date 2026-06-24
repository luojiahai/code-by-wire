import type { WorkflowRun } from "@shared/types";
import { cx } from "../../ui/atoms";
import { RunStats } from "./RunStats";

/** The workflow run's header row: name, status badge, args, and the headline stats. */
export function WorkflowHeader({ run }: { run: WorkflowRun }) {
  const running = run.status === "running";
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <span className="text-[13px] font-semibold text-fg">
        {run.workflowName}
      </span>
      <span
        className={cx(
          "rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-fg-muted",
          running && "animate-pulse-soft text-fg",
        )}
      >
        {run.status}
      </span>
      {run.args ? (
        <span className="rounded border border-ink-800 px-1.5 py-0.5 text-[10px] text-fg-faint">
          {run.args}
        </span>
      ) : null}
      <span className="flex-1" />
      <RunStats run={run} />
    </div>
  );
}
