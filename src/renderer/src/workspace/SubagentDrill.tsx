import { Center, TranscriptFeed } from "./TranscriptView";
import type { DocState } from "./use-transcript";
import { cx, focusRing } from "../ui/atoms";
import { OverlayScroll } from "../ui/OverlayScroll";
import type { DispatchDrill } from "./drill-index";
import { useTranscriptModals } from "./use-transcript-modals";

/** One level of the drill path: which subagent, plus the type and (optional) description its crumb shows. */
export type SubagentCrumb = {
  agentId: string;
  type: string;
  description?: string;
};

/** One level of the drill path. A subagent crumb drills its transcript; a shell crumb drills its log. */
export type DrillCrumb =
  | { kind: "subagent"; agentId: string; type: string; description?: string }
  | { kind: "shell"; shellId: string; label: string };

/** The current crumb's label: "Subagent (<type>): <description>", or just "Subagent (<type>)" when the
 *  dispatch carried no description. Ancestor crumbs stay terse (the bare type) so the path reads compact. */
function subagentCrumbLabel(crumb: SubagentCrumb): string {
  return crumb.description
    ? `Subagent (${crumb.type}): ${crumb.description}`
    : `Subagent (${crumb.type})`;
}

/**
 * The drilled-in Subagent surface: a breadcrumb (Session › … › Subagent (<type>): <description>) above
 * the shared event feed. A pure renderer of the `doc` it's handed — the subagent poll is lifted to
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
    <div className="flex shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-925 px-4 py-2 text-meta">
      <button
        type="button"
        onClick={() => onNavigate(0)}
        className={cx(
          "inline-flex shrink-0 items-center gap-1 rounded-sm text-fg-muted transition-colors hover:text-fg",
          focusRing,
        )}
      >
        <span aria-hidden>←</span> Session
      </button>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span
            key={c.agentId}
            className={cx(
              "flex items-center gap-2",
              last ? "min-w-0 flex-1" : "shrink-0",
            )}
          >
            <span className="shrink-0 text-ink-700">›</span>
            {last ? (
              <span
                className="min-w-0 flex-1 truncate font-medium text-fg"
                title={subagentCrumbLabel(c)}
              >
                {subagentCrumbLabel(c)}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(i + 1)}
                className={cx(
                  "shrink-0 rounded-sm text-fg-muted transition-colors hover:text-fg",
                  focusRing,
                )}
              >
                {c.type}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
