import { memo, useState } from "react";
import type { Account } from "@shared/types";
import { Bar, cx } from "./atoms";
import { barFill } from "./meta";
import { Icon } from "./icons";
import { maskEmail, railAccountModel } from "./rail-account";
import { OVERVIEW_ID } from "../stats/sentinel";

/**
 * The rail's pinned identity panel: an account card that opens Overview (subscription email + plan +
 * 5h/Weekly gauges, an api endpoint host, or — with no account — a bare Overview label). Replaces the old
 * RailAccount block and the separate pinned Overview button. CLI status lives in the band just below this
 * card (RailCliStatus).
 *
 * Memoized so a burst of filter keystrokes (which re-render the rail) doesn't rebuild the card — `account`,
 * `selectedId`, and `onSelect` are stable across them, and `now` is floored to the second by the caller.
 */
export const RailPanel = memo(function RailPanel({
  account,
  now,
  selectedId,
  onSelect,
}: {
  account: Account | null;
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const view = railAccountModel(account, now);
  const active = selectedId === OVERVIEW_ID;
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="shrink-0 p-3">
      <div
        className={cx(
          "group relative block w-full rounded-lg border p-3 text-left transition-colors",
          active
            ? "border-primary/50 bg-primary/[0.06]"
            : "border-ink-800 bg-ink-900 hover:border-ink-700 hover:bg-ink-850",
        )}
      >
        {/* Full-bleed click target for Overview, behind the content. A sibling of the reveal
            button (not its parent), so the two never nest and clicking the eye won't open Overview. */}
        <button
          type="button"
          onClick={() => onSelect(OVERVIEW_ID)}
          aria-pressed={active}
          aria-label="Open overview"
          className="absolute inset-0 rounded-lg"
        />
        {/* Decorative; ignores pointer so clicks fall through to the Overview button. */}
        <Icon
          name="arrow-up-right"
          size={13}
          className={cx(
            "pointer-events-none absolute right-2.5 top-2.5 shrink-0 transition-opacity",
            active
              ? "text-primary opacity-100"
              : "text-fg-faint opacity-0 group-hover:opacity-100",
          )}
        />
        {/* Content sits above the click target; pointer-events fall through except where re-enabled. */}
        <div className="relative z-10 pointer-events-none">
          {view === null ? (
            <div className="flex items-center gap-2 pr-5">
              <Icon
                name="chart-column"
                size={14}
                className={cx(
                  "shrink-0",
                  active ? "text-primary" : "text-fg-faint",
                )}
              />
              <span className="text-[13px] font-medium text-fg-muted">
                Overview
              </span>
            </div>
          ) : view.mode === "api" ? (
            <>
              <div className="truncate pr-5 font-mono text-[12.5px] font-medium text-fg">
                {view.baseUrl}
              </div>
              <div className="mt-0.5 text-[11px] text-fg-faint">
                {view.plan}
              </div>
            </>
          ) : (
            <>
              {view.email && (
                <div className="flex items-center gap-1.5 pr-5">
                  {/* Masked and full forms share one grid cell, so the slot is sized to the wider of
                      the two and the eye keeps a fixed position across toggles. Only the active form
                      is visible; the other holds its space via `invisible` (visibility, not display). */}
                  <span className="grid min-w-0">
                    <span
                      className={cx(
                        "col-start-1 row-start-1 truncate text-[12.5px] font-medium text-fg",
                        revealed && "invisible",
                      )}
                    >
                      {maskEmail(view.email)}
                    </span>
                    <span
                      className={cx(
                        "col-start-1 row-start-1 truncate text-[12.5px] font-medium text-fg",
                        !revealed && "invisible",
                      )}
                    >
                      {view.email}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setRevealed((v) => !v)}
                    aria-pressed={revealed}
                    aria-label={revealed ? "Hide email" : "Show email"}
                    className="pointer-events-auto shrink-0 text-fg-faint transition-colors hover:text-fg-muted"
                  >
                    <Icon name={revealed ? "eye-off" : "eye"} size={12} />
                  </button>
                </div>
              )}
              <div className="mt-0.5 text-[11px] text-fg-faint">
                {view.plan}
              </div>
              {view.gauges.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-2">
                  {view.gauges.map((g) => (
                    <div key={g.label} className="flex items-center gap-2.5">
                      <span className="w-9 shrink-0 text-[10px] uppercase tracking-wide text-fg-faint">
                        {g.label}
                      </span>
                      <Bar
                        pct={g.pct}
                        fill={barFill(g.pct, 90)}
                        className="flex-1"
                      />
                      <span className="w-8 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-fg-muted">
                        {g.pct}%
                      </span>
                      <span className="w-12 shrink-0 text-right font-mono text-[9.5px] tabular-nums text-fg-faint">
                        {g.reset}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});
