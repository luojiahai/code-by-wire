import { useMemo } from "react";
import type { ContextBreakdown } from "@shared/transcript";
import type {
  Account,
  RateLimit,
  RateLimitWindows,
  ExtraUsage,
} from "@shared/types";
import { pickWindow } from "@shared/statusline";
import { contextView } from "@shared/context";
import { formatTokensShort } from "@shared/format";
import { cx } from "../../ui/atoms";
import { FillGauge } from "../../ui/charts";
import { clampPct } from "../../ui/charts-geom";
import {
  ctxColor,
  ctxTone,
  CONTEXT_WARN_PCT,
  CONTEXT_DANGER_PCT,
} from "../../ui/meta";
import { useI18n } from "../../i18n";
import { PanelSection, PanelHeading } from "./chrome";

/** One rate-limit window row: label · bar · % · resets-in. A missing window renders dimmed with
 *  dashes (the section never disappears — an API-billed account simply has no windows). */
function RateRow({
  label,
  window: w,
  now,
}: {
  label: string;
  window?: RateLimit;
  now: number;
}) {
  const { t } = useI18n();
  const pct = w ? clampPct(Math.round(w.usedPct)) : 0;
  return (
    <div className={cx("flex items-center gap-2", !w && "opacity-40")}>
      <span className="w-7 shrink-0 text-xs text-(--ui-text-tertiary)">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <FillGauge
          pct={pct}
          fill={ctxColor(pct)}
          caution={CONTEXT_WARN_PCT}
          danger={CONTEXT_DANGER_PCT}
          height={4}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-(--ui-text-secondary)">
        {w ? `${pct}%` : "-"}
      </span>
      <span className="w-11 shrink-0 text-right font-mono text-xs tabular-nums text-(--ui-text-tertiary)">
        {w ? t.time.countdown(w.resetsAt, now) : "-"}
      </span>
    </div>
  );
}

/**
 * The cockpit's headroom instrument (cockpit spec §Pressure): live context fill (capture preferred,
 * transcript fallback — contextView unchanged) toward the window, then one row per rate-limit
 * window, each merged per-session (spec §1.4): the selected session's own capture window wins,
 * the account API window fills what it's missing. 5h and 7d always render (dashed off a
 * capture-less or API-billed account); the weekly per-model buckets appear only when either side
 * carries them.
 */
export function PressurePanel({
  live,
  context,
  contextPct,
  contextWindow,
  account,
  rateLimits,
}: {
  live: ContextBreakdown | null;
  context: ContextBreakdown | null;
  contextPct: number;
  contextWindow: number;
  account: Account | null;
  /** The selected session's own capture windows — the merge's winning side. */
  rateLimits?: RateLimitWindows | null;
}) {
  const { t } = useI18n();
  const view = useMemo(
    () =>
      contextView({
        live,
        fallback: context,
        capturedPct: live ? contextPct : null,
        window: contextWindow,
      }),
    [live, context, contextPct, contextWindow],
  );
  const now = Date.now();

  // Per-session merge (spec §1.4): the session's own capture window wins; the account's API-fetched
  // window fills what's missing. Another session's numbers are unreachable by construction.
  const fiveHour = pickWindow(rateLimits?.fiveHour, account?.fiveHour, now);
  const sevenDay = pickWindow(rateLimits?.sevenDay, account?.sevenDay, now);
  const sevenDaySonnet = pickWindow(
    rateLimits?.sevenDaySonnet,
    account?.sevenDaySonnet,
    now,
  );
  const sevenDayOpus = pickWindow(
    rateLimits?.sevenDayOpus,
    account?.sevenDayOpus,
    now,
  );

  return (
    <PanelSection>
      <PanelHeading icon="gauge" info={t.dock.pressure.info}>
        {t.dock.pressure.heading}
      </PanelHeading>
      {view ? (
        <>
          <div className="flex items-baseline justify-between">
            <div
              className={cx(
                "font-mono text-title font-medium leading-none tabular-nums",
                ctxTone(view.pct),
              )}
            >
              {view.pct}
              <span className="text-xs text-fg-faint">
                {t.dock.pressure.contextWindowUnit}
              </span>
            </div>
            <div className="font-mono text-xs tabular-nums text-(--ui-text-tertiary)">
              {formatTokensShort(view.total)} /{" "}
              {formatTokensShort(contextWindow)}
            </div>
          </div>
          <FillGauge
            pct={view.pct}
            fill={ctxColor(view.pct)}
            caution={CONTEXT_WARN_PCT}
            danger={CONTEXT_DANGER_PCT}
            height={4}
          />
        </>
      ) : (
        <p className="text-xs text-(--ui-text-quaternary)">
          {t.dock.pressure.noContext}
        </p>
      )}
      <div className="mt-1 space-y-1.5">
        <RateRow
          label={t.dock.pressure.windowFiveHour}
          window={fiveHour}
          now={now}
        />
        <RateRow
          label={t.dock.pressure.windowSevenDay}
          window={sevenDay}
          now={now}
        />
        {sevenDaySonnet && (
          <RateRow
            label={t.dock.pressure.windowSevenDaySonnet}
            window={sevenDaySonnet}
            now={now}
          />
        )}
        {sevenDayOpus && (
          <RateRow
            label={t.dock.pressure.windowSevenDayOpus}
            window={sevenDayOpus}
            now={now}
          />
        )}
        {account?.extraUsage?.enabled && (
          <ExtraRow extra={account.extraUsage} />
        )}
      </div>
    </PanelSection>
  );
}

/** The account's paid extra-usage credit: label · bar · % · a dash where the countdown would sit
 *  (extra usage has no reset). Credits arrive in cents; the tooltip shows used/limit in currency. */
function ExtraRow({ extra }: { extra: ExtraUsage }) {
  const { t } = useI18n();
  const pct = clampPct(Math.round(extra.utilization ?? 0));
  const detail =
    extra.used != null && extra.limit != null
      ? `${(extra.used / 100).toFixed(2)}/${(extra.limit / 100).toFixed(2)} ${extra.currency ?? "USD"}`
      : undefined;
  return (
    <div className="flex items-center gap-2" title={detail}>
      <span className="w-7 shrink-0 text-xs text-(--ui-text-tertiary)">
        {t.dock.pressure.extra}
      </span>
      <div className="min-w-0 flex-1">
        <FillGauge
          pct={pct}
          fill={ctxColor(pct)}
          caution={CONTEXT_WARN_PCT}
          danger={CONTEXT_DANGER_PCT}
          height={4}
        />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-(--ui-text-secondary)">
        {pct}%
      </span>
      <span className="w-11 shrink-0 text-right font-mono text-xs tabular-nums text-(--ui-text-tertiary)">
        -
      </span>
    </div>
  );
}
