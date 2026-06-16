import type { TokenSpeed } from "@shared/metrics";
import { formatTps } from "@shared/format";
import { RateBar } from "../../ui/charts";
import { ratePct } from "../../ui/charts-geom";
import { SPEED_WINDOW_LABEL } from "./speed-window";
import { PanelSection, PanelHeading } from "./chrome";

const SPEED_INFO =
  "Token throughput over the last 60s of active generation: output, input, and total per second. Idle gaps between turns don't count.";

/** Rolling-window token throughput: a hero total over two rate bars (output, input) scaled to the faster
 *  of the two. Renders nothing while metrics haven't reported a speed (no completed request yet) — the
 *  whole section hides (empty-state rule). */
export function TokenSpeedPanel({
  speed,
}: {
  speed: TokenSpeed | null | undefined;
}) {
  if (!speed) return null;
  const max = Math.max(speed.outputTps, speed.inputTps);
  return (
    <PanelSection>
      <PanelHeading
        info={SPEED_INFO}
        right={
          <span className="rounded border border-ink-800 px-1 py-px text-[9px] uppercase tracking-wider text-fg-faint">
            {SPEED_WINDOW_LABEL}
          </span>
        }
      >
        Token speed
      </PanelHeading>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-[11px] text-fg-muted">Total throughput</span>
        <span className="font-mono text-base font-bold tabular-nums text-fg">
          {formatTps(speed.totalTps)}
        </span>
      </div>
      <RateBar
        label="Output"
        value={formatTps(speed.outputTps)}
        pct={ratePct(speed.outputTps, max)}
        color="var(--color-violet)"
      />
      <RateBar
        label="Input"
        value={formatTps(speed.inputTps)}
        pct={ratePct(speed.inputTps, max)}
        color="var(--color-fg-muted)"
      />
    </PanelSection>
  );
}
