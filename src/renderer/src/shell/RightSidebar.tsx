import type { Account, Session } from "@shared/types";
import { AGENTS } from "@shared/agents";
import { useI18n } from "../i18n";
import { useTranscript } from "../workspace/use-transcript";
import type { MetricsState } from "../workspace/use-metrics";
import { PressurePanel } from "../workspace/panels/PressurePanel";
import { SpendPanel } from "../workspace/panels/SpendPanel";
import { TokenSpeedPanel } from "../workspace/panels/TokenSpeedPanel";
import { DutyPanel } from "../workspace/panels/DutyPanel";
import { SessionPanel } from "./SessionPanel";
import { OverlayScroll } from "../ui/OverlayScroll";
import { TOKEN_KINDS } from "../ui/token-kinds";

/**
 * The right sidebar's content (design spec §6): an empty draggable top strip — the fixed right
 * toggle cluster floats over it — then the telemetry panel stack: Pressure, Spend, Throughput,
 * then Duty when the agent has it, then a hairline, then Session. Renders as plain content — the caller slots it inside a
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
  const { t } = useI18n();
  const doc = useTranscript(session.id);
  const caps = AGENTS[session.agent].capabilities;
  const hasTelemetry = caps.hasTelemetry;
  return (
    <div className="flex h-full flex-col border-l border-(--ui-stroke-secondary) bg-(--ui-sidebar-surface-background) text-(--ui-text-tertiary) shadow-[inset_0.0625rem_0_0_color-mix(in_srgb,white_12%,transparent)]">
      <div
        className="drag-region shrink-0 select-none"
        style={{ height: "var(--titlebar-height)" }}
      />

      {hasTelemetry ? (
        /* px-1.5 on top of PanelSection's own px-2.5 ≈ the left sidebar's ~16px content inset,
            scoped here so the Activity dock's PanelSections keep their tighter fit. Explicit
            dividers (not divide-y): their mx-2.5 matches PanelSection's px-2.5, so the hairlines
            start and end exactly where the content does. */
        <OverlayScroll className="min-h-0 flex-1">
          <div className="flex flex-col px-1.5 pb-2">
            <PressurePanel
              live={session.liveContext ?? null}
              context={doc?.context ?? null}
              contextPct={session.contextPct}
              contextWindow={session.contextWindow}
              /* Account is derived from Claude sources (statusline + Claude's OAuth usage API), so
                 it must not backfill another agent's windows via pickWindow — the one sanctioned
                 id-check in this file, until Account itself goes multi-agent (spec: Future work). */
              account={session.agent === "claude" ? account : null}
              rateLimits={session.rateLimits ?? null}
              windowRowsWhenFetchedOnly={session.agent === "codex"}
            />
            <SectionDivider />
            <SpendPanel
              usageByModel={session.usageByModel ?? []}
              costUsd={session.costUsd ?? null}
              kinds={TOKEN_KINDS}
            />
            <SectionDivider />
            {/* Keyed by session: the panel's sparkline accumulates per-session history in state, and
                this sidebar (unlike Workspace) is NOT remounted per session — without the key the
                previous session's trend would persist into the next session's sparkline. */}
            <TokenSpeedPanel
              key={session.id}
              speed={metrics ? metrics.tokenSpeed : null}
            />
            {caps.hasDuty && (
              <>
                <SectionDivider />
                <DutyPanel
                  apiDurationMs={session.apiDurationMs ?? null}
                  sessionClockMs={session.sessionClockMs ?? null}
                />
              </>
            )}
            <SectionDivider />
            <SessionPanel
              session={session}
              git={metrics?.git}
              pr={metrics?.pr}
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

/** The hairline between rail sections, inset mx-2.5 to align with PanelSection's px-2.5 content. */
function SectionDivider() {
  return <div className="mx-2.5 border-t border-(--ui-stroke-tertiary)" />;
}
