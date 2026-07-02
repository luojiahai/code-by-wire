import { useMemo } from "react";
import type { ContextBreakdown } from "@shared/transcript";
import { contextView } from "@shared/context";
import { formatTokensShort } from "@shared/format";
import { cx } from "../../ui/atoms";
import { FillGauge } from "../../ui/charts";
import {
  ctxColor,
  ctxTone,
  CONTEXT_WARN_PCT,
  CONTEXT_DANGER_PCT,
} from "../../ui/meta";
import { PanelSection, PanelHeading } from "./chrome";

const CONTEXT_INFO =
  "How much of the model's context window the current prompt fills: used tokens over the window size. The gauge warms to amber past 70% and redlines past 85%.";

/**
 * The current context window fill, as a linear fuel gauge toward the window ceiling. Prefers Claude's own
 * numbers from the statusLine capture (the current_usage total and used_percentage), so the panel's %
 * matches the Overview's for the same Session; falls back to the transcript-derived split over the window
 * when no capture reported them. The gauge's caution/danger bands show how much headroom is left. null
 * view means no source has any context yet.
 */
export function ContextPanel({
  live,
  context,
  contextPct,
  contextWindow,
}: {
  live: ContextBreakdown | null;
  context: ContextBreakdown | null;
  contextPct: number;
  contextWindow: number;
}) {
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

  if (!view) {
    return (
      <PanelSection>
        <PanelHeading info={CONTEXT_INFO}>Context</PanelHeading>
        <p className="text-xs text-(--ui-text-quaternary)">
          No context sampled yet.
        </p>
      </PanelSection>
    );
  }
  const { total, pct } = view;
  const free = Math.max(0, contextWindow - total);
  return (
    <PanelSection>
      <PanelHeading info={CONTEXT_INFO}>Context</PanelHeading>
      <div className="flex items-baseline justify-between">
        <div
          className={cx(
            "font-mono text-display font-medium leading-none tabular-nums",
            ctxTone(pct),
          )}
        >
          {pct}
          <span className="text-title text-fg-faint">%</span>
        </div>
        <div className="font-mono text-[0.625rem] text-(--ui-text-quaternary)">
          {formatTokensShort(contextWindow)} window
        </div>
      </div>
      <FillGauge
        pct={pct}
        fill={ctxColor(pct)}
        caution={CONTEXT_WARN_PCT}
        danger={CONTEXT_DANGER_PCT}
      />
      <div className="font-mono text-xs text-(--ui-text-secondary)">
        {formatTokensShort(total)} used
        <span className="mx-1.5 text-(--ui-text-quaternary)">·</span>
        {formatTokensShort(free)} free
      </div>
    </PanelSection>
  );
}
