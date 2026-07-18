import type { HourDowCell } from "@shared/stats";
import { CALENDAR_RAMP } from "../ui/meta";
import { foldHourly, maxHourlyTurns } from "./hourly";
import { StatsCard, CardRegion } from "./shared";
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapYAxis,
  HeatmapTooltip,
} from "../ui/bklit/charts/heatmap";

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Chart margins — left clears the weekday labels; keep in sync with the hour-label row's pl. */
const MARGIN = { top: 4, right: 8, bottom: 8, left: 34 };

/**
 * Card: the (weekday × hour) activity heatmap — when the user actually works, range-scoped like
 * the daily chart. Columns are hours (0–23), rows are weekdays; the Bklit heatmap's own X axis
 * renders month labels (it's GitHub-calendar-shaped), so the hour labels are a plain flex row
 * aligned under the grid instead.
 */
export function ActivityHeatmapCard({ hourly }: { hourly: HourDowCell[] }) {
  if (hourly.length === 0) return null;
  const peak = maxHourlyTurns(hourly);
  return (
    <StatsCard>
      <CardRegion title="Active hours">
        <div className="mb-1 text-meta text-fg-faint">
          Peak{" "}
          <span className="font-mono tabular-nums text-fg-muted">{peak}</span>{" "}
          turns in one hour slot
        </div>
        {/* fluid: width drives square cells so the grid always spans the full row. "fill" +
            aspectRatio let the HEIGHT bind cell size, leaving dead space on the right while the
            hour-label row spanned the full width — every label drifted hours off its column. */}
        <HeatmapChart
          data={foldHourly(hourly)}
          layout="fluid"
          gap={2}
          margin={MARGIN}
          levelColors={CALENDAR_RAMP}
          className="text-meta"
        >
          <HeatmapCells />
          <HeatmapYAxis tickFilter="odd" />
          <HeatmapTooltip
            showDateHeader={false}
            formatLabel={(count, date) =>
              `${count} turn${count === 1 ? "" : "s"} · ${DOW_NAMES[date.getDay()]} ${String(
                date.getHours(),
              ).padStart(2, "0")}:00`
            }
          />
        </HeatmapChart>
        {/* Hour labels at their true column centers ((h + 0.5) / 24 of the plot width) — an even
            flex spread drifts against the grid. The margins offset to the plot area's edges. */}
        <div
          className="relative h-4 font-mono text-micro text-fg-faint"
          style={{ marginLeft: MARGIN.left, marginRight: MARGIN.right }}
        >
          {[0, 6, 12, 18, 23].map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2"
              style={{ left: `${((h + 0.5) / 24) * 100}%` }}
            >
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
      </CardRegion>
    </StatsCard>
  );
}
