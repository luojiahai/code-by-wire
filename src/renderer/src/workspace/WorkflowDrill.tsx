import type { WorkflowRun } from "@shared/types";
import { cx, focusRing } from "../ui/atoms";
import { OverlayScroll } from "../ui/OverlayScroll";
import { AgentList } from "./workflow/AgentList";
import { PhaseStrip } from "./workflow/PhaseStrip";
import { WorkflowHeader } from "./workflow/WorkflowHeader";
import { RunResult } from "./workflow/RunResult";
import { AgentDetail } from "./workflow/AgentDetail";
import type { DocState } from "./use-transcript";

/** Tri-state run, from useWorkflowRun: undefined = loading, null = absent, a run once read. */
type RunState = WorkflowRun | null | undefined;

/** The drill path back to the session transcript, matching the Subagent/Shell breadcrumb: a "← Session"
 *  root that pops back, then the current "Workflow: <name>" crumb. */
function WorkflowCrumb({ name, onBack }: { name: string; onBack: () => void }) {
  const crumb = `Workflow: ${name}`;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-925 px-4 py-2 text-[11px]">
      <button
        type="button"
        onClick={onBack}
        className={cx(
          "inline-flex shrink-0 items-center gap-1 rounded-sm text-fg-muted transition-colors hover:text-fg",
          focusRing,
        )}
      >
        <span aria-hidden>←</span> Session
      </button>
      <span className="shrink-0 text-ink-700">›</span>
      <span
        className="min-w-0 flex-1 truncate font-semibold text-fg"
        title={crumb}
      >
        {crumb}
      </span>
    </div>
  );
}

/**
 * The dedicated workflow-run surface, drilled into the center pane. Renders the run header, phase strip,
 * and a master/detail split: the agent list on the left, and either the selected agent's transcript or
 * the run result on the right. When no agents exist yet, renders the run result full-width.
 */
export function WorkflowDrill({
  run,
  name,
  onBack,
  selectedAgentId,
  onSelectAgent,
  agentDoc,
}: {
  run: RunState;
  name: string;
  onBack: () => void;
  selectedAgentId?: string;
  onSelectAgent: (id: string | undefined) => void;
  agentDoc: DocState;
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
          {run.agents.length === 0 ? (
            <OverlayScroll className="min-h-0 flex-1 border-t border-ink-850">
              <RunResult run={run} />
            </OverlayScroll>
          ) : (
            <div className="flex min-h-0 flex-1 border-t border-ink-850">
              <OverlayScroll className="min-h-0 w-80 shrink-0 border-r border-ink-850">
                <AgentList
                  run={run}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={onSelectAgent}
                />
              </OverlayScroll>
              <div className="min-h-0 flex-1">
                {(() => {
                  const selected =
                    selectedAgentId !== undefined
                      ? run.agents.find((a) => a.id === selectedAgentId)
                      : undefined;
                  return selected ? (
                    <AgentDetail agent={selected} doc={agentDoc} />
                  ) : (
                    <OverlayScroll className="h-full">
                      <RunResult run={run} />
                    </OverlayScroll>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
