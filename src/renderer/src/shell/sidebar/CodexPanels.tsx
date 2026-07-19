import { CORE_TOKEN_KINDS } from "../../ui/token-kinds";
import { useI18n } from "../../i18n";
import { PressurePanel } from "../../workspace/panels/PressurePanel";
import { SpendPanel } from "../../workspace/panels/SpendPanel";
import { TokenSpeedPanel } from "../../workspace/panels/TokenSpeedPanel";
import { SessionPanel } from "../SessionPanel";
import { SectionDivider } from "./SectionDivider";
import type { SidebarPanelsProps } from "./index";

/** Codex's telemetry stack: Pressure (no account fill — Account is Claude-derived and must never
 *  backfill another agent's windows; rows hide once the limits fetch confirms them absent) →
 *  Spend (three kinds: codex reports no cache-write tokens, and no $ accounting) → Throughput →
 *  Session. No Duty — codex has no honest api-duration source. */
export function CodexPanels({ session, metrics, doc }: SidebarPanelsProps) {
  const { t } = useI18n();
  return (
    <>
      <PressurePanel
        live={session.liveContext ?? null}
        context={doc?.context ?? null}
        contextPct={session.contextPct}
        contextWindow={session.contextWindow}
        account={null}
        rateLimits={session.rateLimits ?? null}
        windowRowsWhenFetchedOnly
      />
      <SectionDivider />
      <SpendPanel
        usageByModel={session.usageByModel ?? []}
        costUsd={session.costUsd ?? null}
        kinds={CORE_TOKEN_KINDS}
        info={t.dock.spend.infoCodex}
      />
      <SectionDivider />
      {/* Keyed by session — same sparkline-bleed rule as ClaudePanels. */}
      <TokenSpeedPanel
        key={session.id}
        speed={metrics ? metrics.tokenSpeed : null}
      />
      <SectionDivider />
      <SessionPanel session={session} git={metrics?.git} pr={metrics?.pr} />
    </>
  );
}
