import type { Account, RateLimit } from "@shared/types";
import { formatResetCountdown, formatAgoShort } from "@shared/format";
import { StatsCard, CardRegion } from "./shared";
import { Gauge } from "../ui/bklit/charts/gauge";

/** The gauge arc warms on the same 70/85 breakpoints as ctxTone/barFill, so "how full" reads the
 *  same color language everywhere in the app. */
function gaugeFill(pct: number): string {
  if (pct >= 85) return "var(--color-accent-bright)";
  if (pct >= 70) return "var(--color-accent)";
  return "var(--color-primary)";
}

function WindowGauge({
  label,
  window: w,
  now,
}: {
  label: string;
  window: RateLimit;
  now: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(w.usedPct)));
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <Gauge
        value={pct}
        centerValue={pct}
        suffix="%"
        defaultLabel={label}
        activeFill={gaugeFill(pct)}
        inactiveFill="var(--color-ink-800)"
        minWidth={180}
        className="w-full max-w-56"
      />
      <div className="text-meta text-fg-faint">
        resets in{" "}
        <span className="font-mono tabular-nums text-fg-muted">
          {formatResetCountdown(w.resetsAt, now)}
        </span>
      </div>
    </div>
  );
}

/**
 * Card: the account's rate-limit windows as arc gauges — the same 5h/7d utilization the pressure
 * bars show, but glanceable. Subscription accounts only (API billing carries no windows); hidden
 * entirely when there is no live statusLine account data.
 */
export function RateLimitCard({ account }: { account: Account | null }) {
  if (!account || (!account.fiveHour && !account.sevenDay)) return null;
  const now = Date.now();
  // Every window the source carried, aggregates first, then the per-model weekly buckets — the
  // same set (and order) the CLI's /usage screen lists.
  const windows: { label: string; w: RateLimit | undefined }[] = [
    { label: "5-hour window", w: account.fiveHour },
    { label: "7-day window", w: account.sevenDay },
    { label: "7-day · Fable", w: account.sevenDayFable },
    { label: "7-day · Sonnet", w: account.sevenDaySonnet },
    { label: "7-day · Opus", w: account.sevenDayOpus },
  ];
  return (
    <StatsCard>
      <CardRegion title="Rate limits">
        <div className="flex flex-wrap items-start justify-around gap-4">
          {windows.map(
            ({ label, w }) =>
              w && (
                <WindowGauge key={label} label={label} window={w} now={now} />
              ),
          )}
        </div>
        {account.asOfMs != null && account.asOfMs > 0 && (
          <div className="mt-2 text-right text-micro text-fg-faint">
            as of {formatAgoShort(account.asOfMs, now)}
          </div>
        )}
      </CardRegion>
    </StatsCard>
  );
}
