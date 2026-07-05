import type { Account, Session } from "@shared/types";
import { useTranscript } from "../workspace/use-transcript";
import type { MetricsState } from "../workspace/use-metrics";
import { PressurePanel } from "../workspace/panels/PressurePanel";
import { SpendPanel } from "../workspace/panels/SpendPanel";
import { TokenSpeedPanel } from "../workspace/panels/TokenSpeedPanel";
import { DutyPanel } from "../workspace/panels/DutyPanel";
import { SessionPanel } from "./SessionPanel";

/**
 * The right sidebar's content (design spec §6): an empty draggable top strip — the fixed right
 * toggle cluster floats over it — then the telemetry panel stack: Pressure, Spend, Throughput,
 * Duty, then a hairline, then Session. Renders as plain content — the caller slots it inside a
 * `Pane` (Task 11), so this owns no width/position of its own beyond filling its parent.
 *
 * Polls its own transcript: this pane is now a sibling of `Workspace` at the App level rather than a
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
  const doc = useTranscript(session.id);
  return (
    <div className="flex h-full flex-col border-l border-(--ui-stroke-secondary) bg-(--ui-sidebar-surface-background) text-(--ui-text-tertiary) shadow-[inset_0.0625rem_0_0_color-mix(in_srgb,white_12%,transparent)]">
      <div
        className="drag-region shrink-0 select-none"
        style={{ height: "var(--titlebar-height)" }}
      />

      {/* px-1.5 on top of PanelSection's own px-2.5 ≈ the left sidebar's ~16px content inset,
          scoped here so the Activity dock's PanelSections keep their tighter fit. Explicit
          dividers (not divide-y): their mx-2.5 matches PanelSection's px-2.5, so the hairlines
          start and end exactly where the content does. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col px-1.5 pb-2">
          <PressurePanel
            live={session.liveContext ?? null}
            context={doc?.context ?? null}
            contextPct={session.contextPct}
            contextWindow={session.contextWindow}
            account={account}
          />
          <SectionDivider />
          <SpendPanel
            usageByModel={session.usageByModel ?? []}
            costUsd={session.costUsd ?? null}
          />
          <SectionDivider />
          <TokenSpeedPanel speed={metrics ? metrics.tokenSpeed : null} />
          <SectionDivider />
          <DutyPanel
            apiDurationMs={session.apiDurationMs ?? null}
            sessionClockMs={session.sessionClockMs ?? null}
          />
          <SectionDivider />
          <SessionPanel session={session} git={metrics?.git} pr={metrics?.pr} />
        </div>
      </div>
    </div>
  );
}

/** The hairline between rail sections, inset mx-2.5 to align with PanelSection's px-2.5 content. */
function SectionDivider() {
  return <div className="mx-2.5 border-t border-(--ui-stroke-tertiary)" />;
}
