import type { Monitor } from "@shared/types";
import { cx } from "../../ui/atoms";
import { useI18n } from "../../i18n";
import { EmptyState } from "./chrome";
import { monitorGlyph } from "./monitor-view";
import { DOCK_GUTTER, DockRow, MetricCell, MetricRack } from "./dock-row";
import { DOCK_GLYPH_PULSE } from "./dock-status-glyph";

/** One monitor as a compact, clickable row: status glyph, description + command, duration, and a relative
 *  start. Clicking drills into the full "Monitor details" modal. */
function MonitorRow({
  monitor,
  active,
  now,
  onDrill,
}: {
  monitor: Monitor;
  active: boolean;
  now: number;
  onDrill: (monitor: Monitor) => void;
}) {
  const { t } = useI18n();
  const glyph = monitorGlyph(monitor);
  const elapsed =
    monitor.status === "running" && monitor.startMs !== undefined
      ? now - monitor.startMs
      : (monitor.durationMs ?? 0);
  return (
    <DockRow
      active={active}
      onClick={() => onDrill(monitor)}
      aria-label={t.dock.monitors.openDetailsAria(monitor.command)}
      leading={
        <span
          className={cx(
            DOCK_GUTTER,
            "shrink-0 text-center font-mono text-meta",
            glyph.tone,
            monitor.status === "running" && DOCK_GLYPH_PULSE,
          )}
        >
          {glyph.char}
        </span>
      }
      trailing={
        <MetricRack>
          <MetricCell width="w-16" tone="text-(--ui-text-secondary)">
            {t.time.duration(elapsed)}
          </MetricCell>
          {monitor.startMs !== undefined && (
            <MetricCell width="w-14">
              {t.time.ago(monitor.startMs, now)}
            </MetricCell>
          )}
        </MetricRack>
      }
    >
      <span
        className="min-w-0 flex-1 truncate text-aux"
        title={
          monitor.description
            ? `${monitor.description}  ${monitor.command}`
            : monitor.command
        }
      >
        {monitor.description ? (
          <>
            <span className="text-(--ui-text-secondary)">
              {monitor.description}
            </span>
            <span className="ml-2 font-mono text-meta text-(--ui-text-tertiary)">
              {monitor.command}
            </span>
          </>
        ) : (
          <span className="font-mono text-meta text-(--ui-text-secondary)">
            {monitor.command}
          </span>
        )}
      </span>
    </DockRow>
  );
}

/**
 * The Activity dock's Monitors tab: a compact list of every Monitor the session launched, ordered by
 * start time. View-only — clicking a row drills into its details modal. Empty until the session starts a
 * monitor.
 */
export function MonitorsTab({
  monitors,
  now,
  activeMonitorId,
  onDrill,
}: {
  monitors: Monitor[];
  now: number;
  activeMonitorId?: string;
  onDrill: (monitor: Monitor) => void;
}) {
  const { t } = useI18n();
  if (monitors.length === 0)
    return <EmptyState>{t.dock.monitors.empty}</EmptyState>;
  return (
    <div className="py-1" role="list">
      {monitors.map((m) => (
        <MonitorRow
          key={m.id}
          monitor={m}
          active={m.id === activeMonitorId}
          now={now}
          onDrill={onDrill}
        />
      ))}
    </div>
  );
}
