import { dutyPct } from "@shared/duty";
import { FillGauge } from "../../ui/charts";
import { useI18n } from "../../i18n";
import { PanelSection, PanelHeading } from "./chrome";

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
  const { t } = useI18n();
  const pct = dutyPct(apiDurationMs, sessionClockMs);
  return (
    <PanelSection>
      <PanelHeading icon="timer" info={t.dock.duty.info}>
        {t.dock.duty.heading}
      </PanelHeading>
      <div className="flex items-baseline justify-between">
        {pct != null ? (
          <span className="font-mono text-title font-medium tabular-nums text-fg">
            {pct}
            <span className="text-xs text-fg-faint">{t.dock.duty.apiUnit}</span>
          </span>
        ) : (
          <span className="font-mono text-title font-medium text-fg-faint">
            -
          </span>
        )}
        <span className="font-mono text-xs tabular-nums text-(--ui-text-tertiary)">
          {apiDurationMs != null && sessionClockMs != null
            ? `${t.time.duration(apiDurationMs)} / ${t.time.duration(sessionClockMs)}`
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
