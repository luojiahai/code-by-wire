import { memo } from "react";
import type { Account } from "@shared/types";
import { Bar } from "./atoms";
import { barFill } from "./meta";
import { railAccountModel } from "./rail-account";

/** The account block pinned at the top of the rail. Two modes (railAccountModel decides which):
 *  subscription shows email + plan + rate-limit gauges with reset countdowns; api shows the configured
 *  endpoint host + plan. Renders nothing when there's no account data to show. `now` comes
 *  from the rail's render clock so the subscription countdowns tick with the 3s background sync. Memoized so
 *  a burst of filter keystrokes (which re-render the rail) doesn't rebuild the block — `account` is stable
 *  across them and `now` is floored to the second by the caller. */
export const RailAccount = memo(function RailAccount({
  account,
  now,
}: {
  account: Account | null;
  now: number;
}) {
  const view = railAccountModel(account, now);
  if (!view) return null;

  if (view.mode === "api") {
    return (
      <div className="shrink-0 border-b border-ink-800 p-3">
        <div className="truncate font-mono text-[12.5px] font-medium text-fg">
          {view.baseUrl}
        </div>
        <div className="mt-0.5 text-[11px] text-fg-faint">{view.plan}</div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-ink-800 p-3">
      {view.email && (
        <div className="truncate text-[12.5px] font-medium text-fg">
          {view.email}
        </div>
      )}
      <div className="mt-0.5 text-[11px] text-fg-faint">{view.plan}</div>
      {view.gauges.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {view.gauges.map((g) => (
            <div key={g.label}>
              <div className="flex items-center gap-2.5">
                <span className="w-11 shrink-0 text-[10px] uppercase tracking-wide text-fg-faint">
                  {g.label}
                </span>
                <Bar pct={g.pct} fill={barFill(g.pct, 90)} className="flex-1" />
                <span className="w-8 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-fg-muted">
                  {g.pct}%
                </span>
              </div>
              {g.reset && (
                <div className="mt-1 text-right font-mono text-[9.5px] text-fg-faint">
                  {g.reset}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
