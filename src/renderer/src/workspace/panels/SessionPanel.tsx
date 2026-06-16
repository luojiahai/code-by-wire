import type { Session } from "@shared/types";
import { formatClock } from "@shared/format";
import { modelLabel } from "../../ui/meta";
import { PanelSection, PanelHeading } from "./chrome";
import { MetricRow } from "./MetricRow";

/** Session runtime facts, atop the rail: the Model / Effort / Clock that used to crowd the header.
 *  Effort and Clock are lazy — MetricRow renders a muted em-dash until the capture reports them, so
 *  the empty-state rule comes for free. Voice and Remote were dropped in the redesign. */
export function SessionPanel({ session: s }: { session: Session }) {
  // Vouch for the family only on a Managed session (we spawned it on the picked alias). For an Observed
  // session with no recorded model, modelLabel shows "Unknown" rather than the normalize fallback.
  const model = modelLabel(
    s.model,
    s.modelId ?? s.modelRaw,
    s.modelDisplayName,
    {
      known: s.management === "managed",
    },
  );
  const clock = s.sessionClockMs != null ? formatClock(s.sessionClockMs) : null;
  return (
    <PanelSection>
      <PanelHeading>Session</PanelHeading>
      {/* Rows in their own tight group (space-y-1, matching the Cost/Context legends) so they don't
          inherit PanelSection's looser space-y-2 and stand out from the rest of the rail. */}
      <div className="space-y-1">
        <MetricRow label="Model" value={model} />
        <MetricRow label="Effort" value={s.effortLevel} />
        <MetricRow label="Clock" value={clock} />
      </div>
    </PanelSection>
  );
}
