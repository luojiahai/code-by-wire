import type { FC } from "react";
import type { Account, Session } from "@shared/types";
import type { AgentId } from "@shared/agents";
import type { MetricsState } from "../../workspace/use-metrics";
import type { DocState } from "../../workspace/use-transcript";
import { ClaudePanels } from "./ClaudePanels";
import { CodexPanels } from "./CodexPanels";

/** Everything a per-agent panel stack may draw from. RightSidebar owns the polls and passes the
 *  same props to every composition; each composition forwards only what its agent's panels use
 *  (CodexPanels ignores `account` — Account is Claude-derived, and codex must never render it). */
export interface SidebarPanelsProps {
  session: Session;
  metrics: MetricsState;
  account: Account | null;
  doc: DocState;
}

/** agent → its sidebar panel stack. Capability flags decide WHETHER the sidebar renders
 *  (hasTelemetry); this registry decides WHAT's inside it. Total over AGENT_IDS by construction —
 *  a future telemetry-less agent adds a stub entry that never renders (hasTelemetry short-circuits
 *  to the coming-soon fallback before the lookup matters); never loosen to Partial. */
export const SIDEBAR_PANELS: Record<AgentId, FC<SidebarPanelsProps>> = {
  claude: ClaudePanels,
  codex: CodexPanels,
};
