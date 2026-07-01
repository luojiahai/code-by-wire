import type { ReactNode } from "react";
import type { Session } from "@shared/types";
import type { GitInfo, PrInfo } from "@shared/metrics";
import { formatClock } from "@shared/format";
import { modelLabel } from "../ui/meta";
import { PanelSection, PanelHeading } from "../workspace/panels/chrome";
import { GitReadout } from "./GitReadout";

/**
 * The right sidebar's identity readouts (design spec §6): Model, Effort, Git, and session Clock, each an
 * always-shown label/value row — `-` fills a row when its data hasn't landed rather than hiding it. This
 * is the surviving half of the old Annunciator instrument strip; its State lamp moved to the left
 * sidebar's session row, and its Link/Management lamp moved to the SessionMenu badge, so only the
 * identity readouts remain here, recast as vertical rows instead of the old horizontal strip.
 */
export function IdentityPanel({
  session: s,
  git,
  pr,
}: {
  session: Session;
  git?: GitInfo | null;
  pr?: PrInfo | null;
}) {
  const model = modelLabel(
    s.model,
    s.modelId ?? s.modelRaw,
    s.modelDisplayName,
    { known: s.management === "managed" },
  );
  const clock = s.sessionClockMs != null ? formatClock(s.sessionClockMs) : null;
  return (
    <PanelSection>
      <PanelHeading>Identity</PanelHeading>
      <IdentityRow label="Model">
        <span className="min-w-0 truncate" title={model}>
          {model}
        </span>
      </IdentityRow>
      <IdentityRow label="Effort">{s.effortLevel ?? "-"}</IdentityRow>
      <IdentityRow label="Git">
        <GitReadout session={s} git={git} pr={pr} />
      </IdentityRow>
      <IdentityRow label="Clock">{clock ?? "-"}</IdentityRow>
    </PanelSection>
  );
}

/** One identity row: a faint uppercase label on the left, a mono value (or the Git readout) on the
 *  right. */
function IdentityRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 font-display text-micro font-semibold uppercase tracking-[0.1em] text-fg-faint">
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-aux text-fg">
        {children}
      </span>
    </div>
  );
}
