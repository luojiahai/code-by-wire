import { formatDuration } from "@shared/format";
import { dutyPct } from "@shared/duty";
import { FillGauge } from "../../ui/charts";
import { PanelSection, PanelHeading } from "./chrome";

const DUTY_INFO =
  "The session's duty cycle: how much of its lifetime an API request was actually in flight — time the model was working versus the session sitting open. Cumulative since the session started, so a long-idle session reads low even while currently busy.";

/**
 * The cockpit's work-rate character readout (cockpit spec §Duty): api time over wall time as a
 * plain grey bar — no caution bands, high duty isn't a warning. Renders "-" (empty bar) when either
 * clock is missing, per the always-shown rule.
 */
export function DutyPanel({
  apiDurationMs,
  sessionClockMs,
}: {
  apiDurationMs: number | null;
  sessionClockMs: number | null;
}) {
  const pct = dutyPct(apiDurationMs, sessionClockMs);
  return (
    <PanelSection>
      <PanelHeading icon="timer" info={DUTY_INFO}>
        Duty
      </PanelHeading>
      <div className="flex items-baseline justify-between">
        {pct != null ? (
          <span className="font-mono text-title font-medium tabular-nums text-fg">
            {pct}
            <span className="text-xs text-fg-faint">% api</span>
          </span>
        ) : (
          <span className="font-mono text-title font-medium text-fg-faint">
            -
          </span>
        )}
        <span className="font-mono text-xs tabular-nums text-(--ui-text-tertiary)">
          {apiDurationMs != null && sessionClockMs != null
            ? `${formatDuration(apiDurationMs)} / ${formatDuration(sessionClockMs)}`
            : ""}
        </span>
      </div>
      {/* caution == danger == 100 parks both warning zones at zero width — a plain grey bar. */}
      <FillGauge
        pct={pct ?? 0}
        fill="var(--color-data-3)"
        caution={100}
        danger={100}
        height={4}
      />
    </PanelSection>
  );
}
