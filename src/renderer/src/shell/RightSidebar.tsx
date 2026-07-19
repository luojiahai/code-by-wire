import type { Account, Session } from "@shared/types";
import { AGENTS } from "@shared/agents";
import { useI18n } from "../i18n";
import { useTranscript } from "../workspace/use-transcript";
import type { MetricsState } from "../workspace/use-metrics";
import { SIDEBAR_PANELS } from "./sidebar";
import { OverlayScroll } from "../ui/OverlayScroll";

/**
 * The right sidebar's chrome (design spec §6): an empty draggable top strip — the fixed right
 * toggle cluster floats over it — then the selected agent's panel stack, looked up from
 * SIDEBAR_PANELS (shell/sidebar/ owns what each agent's stack contains; hasTelemetry only decides
 * whether a stack renders at all). Renders as plain content — the caller slots it inside a
 * `Pane` (Task 11), so this owns no width/position of its own beyond filling its parent.
 *
 * Polls its own transcript: this pane is a sibling of `Workspace` at the App level rather than a
 * child of it, so it can't share `WorkspaceBody`'s `useTranscript` poll — a second independent poll of the
 * same session is the accepted minor cost (mirrors `metrics` needing its own App-level call per Task 11).
 */
export function RightSidebar({
  session,
  metrics,
  account,
}: {
  session: Session;
  metrics: MetricsState;
  account: Account | null;
}) {
  const { t } = useI18n();
  const doc = useTranscript(session.id);
  const Panels = SIDEBAR_PANELS[session.agent];
  return (
    <div className="flex h-full flex-col border-l border-(--ui-stroke-secondary) bg-(--ui-sidebar-surface-background) text-(--ui-text-tertiary) shadow-[inset_0.0625rem_0_0_color-mix(in_srgb,white_12%,transparent)]">
      <div
        className="drag-region shrink-0 select-none"
        style={{ height: "var(--titlebar-height)" }}
      />

      {AGENTS[session.agent].capabilities.hasTelemetry ? (
        /* px-1.5 on top of PanelSection's own px-2.5 ≈ the left sidebar's ~16px content inset,
            scoped here so the Activity dock's PanelSections keep their tighter fit. */
        <OverlayScroll className="min-h-0 flex-1">
          <div className="flex flex-col px-1.5 pb-2">
            <Panels
              session={session}
              metrics={metrics}
              account={account}
              doc={doc}
            />
          </div>
        </OverlayScroll>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
          <p className="text-body text-fg-faint">{t.common.comingSoon}</p>
        </div>
      )}
    </div>
  );
}
