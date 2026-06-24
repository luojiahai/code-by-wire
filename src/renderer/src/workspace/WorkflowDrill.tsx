import type { WorkflowRun } from "@shared/types";
import { cx, focusRing } from "../ui/atoms";
import { OverlayScroll } from "../ui/OverlayScroll";
import { AgentList } from "./workflow/AgentList";
import { PhaseStrip } from "./workflow/PhaseStrip";
import { WorkflowHeader } from "./workflow/WorkflowHeader";
import { RunResult } from "./workflow/RunResult";

/** Tri-state run, from useWorkflowRun: undefined = loading, null = absent, a run once read. */
type RunState = WorkflowRun | null | undefined;

/** The breadcrumb back to the session transcript. */
function WorkflowCrumb({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-ink-800 px-3 py-1.5 text-[11px]">
      <button
        type="button"
        onClick={onBack}
        className={cx(
          "rounded text-fg-faint transition-colors hover:text-fg",
          focusRing,
        )}
      >
        Session
      </button>
      <span className="text-fg-faint">›</span>
      <span className="truncate text-fg-muted">{name}</span>
    </div>
  );
}

/**
 * The dedicated workflow-run surface, drilled into the center pane. Renders the run header and (for now)
 * the run result. The phase strip, agent list, and selected-agent transcript are layered on in later
 * tasks. Pure renderer of the run it's handed.
 */
export function WorkflowDrill({
  run,
  name,
  onBack,
  selectedAgentId,
  onSelectAgent,
}: {
  run: RunState;
  name: string;
  onBack: () => void;
  selectedAgentId?: string;
  onSelectAgent: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <WorkflowCrumb name={name} onBack={onBack} />
      {run === null ? (
        <div className="p-3 text-[12px] text-fg-faint">
          No record on disk for this run yet.
        </div>
      ) : run === undefined ? (
        <div className="p-3 text-[12px] text-fg-faint">Loading run…</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <WorkflowHeader run={run} />
          <PhaseStrip phases={run.phases} />
          <div className="flex min-h-0 flex-1 border-t border-ink-850">
            <OverlayScroll className="min-h-0 w-80 shrink-0 border-r border-ink-850">
              <AgentList
                run={run}
                selectedAgentId={selectedAgentId}
                onSelectAgent={onSelectAgent}
              />
            </OverlayScroll>
            <OverlayScroll className="min-h-0 flex-1">
              <RunResult run={run} />
            </OverlayScroll>
          </div>
        </div>
      )}
    </div>
  );
}
