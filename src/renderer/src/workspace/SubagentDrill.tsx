import { Center, TranscriptFeed } from "./TranscriptView";
import type { DocState } from "./use-transcript";
import { OverlayScroll } from "../ui/OverlayScroll";
import type { DispatchDrill } from "./drill-index";
import { useTranscriptModals } from "./use-transcript-modals";

/** One level of the drill path: which subagent, and the label shown in the breadcrumb (its type). */
export type SubagentCrumb = { agentId: string; label: string };

/** One level of the drill path. A subagent crumb drills its transcript; a shell crumb drills its log. */
export type DrillCrumb =
  | { kind: "subagent"; agentId: string; label: string }
  | { kind: "shell"; shellId: string; label: string };

/**
 * The drilled-in Subagent surface: a breadcrumb (Session › … › <type>) above the
 * shared event feed. A pure renderer of the `doc` it's handed — the subagent poll is lifted to
 * WorkspaceBody so it survives the Managed tab toggle. Always read-only — a Subagent is never drivable,
 * even drilled from a Managed Session. The feed is keyed on the current agent id so re-drilling remounts
 * to a fresh tail while same-agent polls preserve scroll.
 */
export function SubagentDrill({
  crumbs,
  onNavigate,
  doc,
  dispatchDrill,
  sessionId,
}: {
  crumbs: SubagentCrumb[];
  onNavigate: (depth: number) => void;
  doc: DocState;
  dispatchDrill?: DispatchDrill;
  sessionId: string;
}) {
  const current = crumbs[crumbs.length - 1];
  // Open-state for this subagent's detail modals. agentId is the current crumb, so a tool's full output
  // is fetched from this subagent's own transcript file.
  const { onOpen, modals } = useTranscriptModals(sessionId, current.agentId);
  return (
    <div className="flex h-full flex-col">
      <Breadcrumb crumbs={crumbs} onNavigate={onNavigate} />
      <OverlayScroll className="min-h-0 flex-1">
        {doc === null ? (
          <Center>No transcript on disk for this subagent yet.</Center>
        ) : (
          <TranscriptFeed
            key={current.agentId}
            events={doc?.events ?? []}
            dispatchDrill={dispatchDrill}
            onOpen={onOpen}
          />
        )}
      </OverlayScroll>
      {modals}
    </div>
  );
}

/** The drill path: a clickable "Session" root that pops back to the Session transcript, then each
 *  subagent crumb (intermediate crumbs clickable, the current one not). */
function Breadcrumb({
  crumbs,
  onNavigate,
}: {
  crumbs: SubagentCrumb[];
  onNavigate: (depth: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-925 px-4 py-2 text-[11px]">
      <button
        type="button"
        onClick={() => onNavigate(0)}
        className="inline-flex items-center gap-1 text-fg-muted transition-colors hover:text-fg"
      >
        <span aria-hidden>←</span> Session
      </button>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={c.agentId} className="flex items-center gap-2">
            <span className="text-ink-700">›</span>
            {last ? (
              <span className="font-semibold text-fg">{c.label}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(i + 1)}
                className="text-fg-muted transition-colors hover:text-fg"
              >
                {c.label}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
