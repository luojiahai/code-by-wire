import { useEffect, useState } from "react";
import type { TokenSpeed } from "@shared/metrics";
import { formatTps } from "@shared/format";
import { Sparkline } from "../../ui/charts";
import { SPEED_WINDOW_LABEL } from "./speed-window";
import { PanelSection, PanelHeading, StatRow } from "./chrome";

const SPEED_INFO =
  "Token throughput over the last 60s of active generation. The sparkline traces total tokens/sec across recent samples; idle gaps between turns don't count.";

const SPARK_SAMPLES = 30;

/** Accumulate a ring buffer of total-tps samples across polls, so the sparkline has a series to draw from a
 *  metric that only reports a current snapshot. Appends when the value changes (each poll re-rolls the 60s
 *  window, so it rarely repeats); resets with the panel, which the Workspace remounts per session. */
function useSpeedHistory(tps: number | null): number[] {
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    if (tps == null) return;
    setHistory((h) => [...h, tps].slice(-SPARK_SAMPLES));
  }, [tps]);
  return history;
}

/** Rolling-window token throughput: a hero total over a trend sparkline, with the output/input split below.
 *  Always renders, per the cockpit's no-vanishing-sections rule — before the first sample the `idle` hero
 *  shows over an empty sparkline. Stays visible once a session has reported throughput — the sparkline
 *  persists the trend across turns instead of flickering out in the idle gap between them. */
export function TokenSpeedPanel({
  speed,
}: {
  speed: TokenSpeed | null | undefined;
}) {
  const history = useSpeedHistory(speed?.totalTps ?? null);
  return (
    <PanelSection>
      <PanelHeading
        icon="activity"
        info={SPEED_INFO}
        right={
          <span className="rounded-sm border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[0.65rem] font-medium leading-none text-(--ui-text-tertiary)">
            {SPEED_WINDOW_LABEL}
          </span>
        }
      >
        Throughput
      </PanelHeading>
      <div className="flex items-baseline justify-between">
        {speed ? (
          <span className="font-mono text-title font-medium tabular-nums text-fg">
            {formatTps(speed.totalTps).replace(/ t\/s$/, "")}
            <span className="text-xs text-fg-faint"> t/s</span>
          </span>
        ) : (
          <span className="font-mono text-title font-medium tabular-nums text-fg-faint">
            idle
          </span>
        )}
        <span className="text-[0.625rem] text-(--ui-text-quaternary)">
          total throughput
        </span>
      </div>
      <Sparkline values={history} />
      {speed && (
        <div className="space-y-1.5">
          <StatRow label="Input" value={formatTps(speed.inputTps)} />
          <StatRow label="Output" value={formatTps(speed.outputTps)} />
        </div>
      )}
    </PanelSection>
  );
}
