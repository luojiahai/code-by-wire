import type { Session } from "@shared/types";
import { cx, focusRing } from "../ui/atoms";
import { OverlayScroll } from "../ui/OverlayScroll";
import { Icon } from "../ui/icons";
import { useTranscript } from "../workspace/use-transcript";
import type { MetricsState } from "../workspace/use-metrics";
import { ContextPanel } from "../workspace/panels/ContextPanel";
import { TokensPanel } from "../workspace/panels/TokensPanel";
import { TokenSpeedPanel } from "../workspace/panels/TokenSpeedPanel";
import { IdentityPanel } from "./IdentityPanel";

/**
 * The right sidebar's content (design spec §6): a draggable top bar with the collapse toggle — mirroring
 * `LeftSidebar`'s, but with no traffic-light inset (the lights are only ever on the left) and the button
 * on the inward-facing (left) edge instead of the left sidebar's right edge — then the telemetry panel
 * stack: Identity, Context, Tokens, Token speed. Renders as plain content — the caller slots it inside a
 * `Pane` (Task 11), so this owns no width/position of its own beyond filling its parent.
 *
 * Polls its own transcript: this pane is now a sibling of `Workspace` at the App level rather than a
 * child of it, so it can't share `WorkspaceBody`'s `useTranscript` poll — a second independent poll of the
 * same session is the accepted minor cost (mirrors `metrics` needing its own App-level call per Task 11).
 */
export function RightSidebar({
  session,
  metrics,
  onCollapse,
}: {
  session: Session;
  metrics: MetricsState;
  onCollapse: () => void;
}) {
  const doc = useTranscript(session.id);
  return (
    <div className="flex h-full flex-col border-l border-sidebar-border bg-sidebar">
      <div
        className="drag-region flex shrink-0 select-none items-center justify-start"
        style={{ height: "var(--titlebar-height)" }}
      >
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          className={cx(
            "no-drag ml-2 inline-flex items-center justify-center rounded p-1.5 text-fg-faint transition-colors hover:text-fg-muted",
            focusRing,
          )}
        >
          <Icon name="panel-right-close" size={15} />
        </button>
      </div>

      <OverlayScroll
        className="min-h-0 flex-1"
        contentClassName="flex flex-col gap-4 p-4"
      >
        <IdentityPanel session={session} git={metrics?.git} pr={metrics?.pr} />
        <ContextPanel
          live={session.liveContext ?? null}
          context={doc?.context ?? null}
          contextPct={session.contextPct}
          contextWindow={session.contextWindow}
        />
        <TokensPanel usageByModel={session.usageByModel ?? []} />
        <TokenSpeedPanel speed={metrics ? metrics.tokenSpeed : null} />
      </OverlayScroll>
    </div>
  );
}
