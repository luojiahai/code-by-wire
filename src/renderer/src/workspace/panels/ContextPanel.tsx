import { useMemo } from "react";
import type { ContextBreakdown } from "@shared/transcript";
import { contextView } from "@shared/context";
import { formatTokensShort } from "@shared/format";
import { cx } from "../../ui/atoms";
import { Ring } from "../../ui/charts";
import { ctxColor, ctxTone } from "../../ui/meta";
import { PanelSection, PanelHeading } from "./chrome";
import { MetricRow } from "./MetricRow";

const CONTEXT_INFO =
  "How much of the model's context window the current prompt fills: used tokens over the window size. The ring warms to amber as it fills.";

/**
 * The current context window fill, as a ring toward the window ceiling. Prefers Claude's own numbers from
 * the statusLine capture (the current_usage total and the used_percentage), so the panel's % matches the
 * Overview's for the same Session; falls back to the transcript-derived split over the window when no
 * capture reported them. null view means no source has any context yet.
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
        <p className="text-[11px] text-fg-faint">No context sampled yet.</p>
      </PanelSection>
    );
  }
  const { total, pct } = view;
  const free = Math.max(0, contextWindow - total);
  return (
    <PanelSection>
      <PanelHeading info={CONTEXT_INFO}>Context</PanelHeading>
      <div className="flex items-center gap-3.5">
        <Ring pct={pct} fill={ctxColor(pct)}>
          <span
            className={cx(
              "font-mono text-[19px] font-bold tabular-nums",
              ctxTone(pct),
            )}
          >
            {pct}%
          </span>
        </Ring>
        <div className="flex-1 space-y-0.5">
          <MetricRow
            label="Used"
            value={`${formatTokensShort(total)} / ${formatTokensShort(contextWindow)}`}
          />
          <MetricRow label="Free" value={formatTokensShort(free)} />
        </div>
      </div>
    </PanelSection>
  );
}
