import type { TurnSummary } from "@shared/transcript";
import { formatDuration, formatRelativeTime } from "@shared/format";
import { cx } from "../../ui/atoms";
import { EmptyState } from "./chrome";
import { DOCK_GUTTER, DockRow, MetricCell, MetricRack } from "./dock-row";

/**
 * The Structure dock's Turns tab: each user prompt and the work it triggered, with the turn's tool count,
 * wall-clock duration, and how long ago it started. Oldest first, display-only for this slice. `now` comes
 * from the parent's render clock so the relative times tick with the 3s background re-sync.
 */
export function TurnsTab({
  turns,
  now,
}: {
  turns: TurnSummary[];
  now: number;
}) {
  if (turns.length === 0) return <EmptyState>No turns yet.</EmptyState>;
  return (
    <div className="py-1" role="list">
      {turns.map((t) => (
        <DockRow
          key={t.index}
          leading={
            <span
              className={cx(
                DOCK_GUTTER,
                "shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-faint",
              )}
            >
              {t.index}
            </span>
          }
          trailing={
            <MetricRack>
              <MetricCell
                width="w-14"
                unit={t.toolCount === 1 ? "tool" : "tools"}
              >
                {t.toolCount}
              </MetricCell>
              <MetricCell width="w-12" tone="text-fg-muted">
                {formatDuration(t.durationMs)}
              </MetricCell>
              <MetricCell width="w-12">
                {formatRelativeTime(t.startMs, now)}
              </MetricCell>
            </MetricRack>
          }
        >
          <span
            className="min-w-0 flex-1 truncate text-[12px] text-fg"
            title={t.prompt}
          >
            {t.prompt}
          </span>
        </DockRow>
      ))}
    </div>
  );
}
