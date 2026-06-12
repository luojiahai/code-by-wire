import { useMemo } from "react";
import type { Family, Usage } from "@shared/types";
import { costBreakdown } from "@shared/models";
import { formatUsd, costDisplay } from "@shared/format";
import { Donut } from "../../ui/charts";
import { COST_SEGMENT_COLORS } from "../../ui/meta";
import { PanelSection, PanelHeading } from "./chrome";
import { MetricRow } from "./MetricRow";

const COST_INFO =
  "This session's Equivalent API value: what its tokens would cost at API rates, split by token kind. Shows real spend instead when the account bills per API call.";

/**
 * Cost for the session: a headline figure (Claude's live number when present, else the computed
 * Equivalent API value) over a donut of the per-token-kind split and the cache-hit saving. The split is
 * always the computed Equivalent API value (we have no live split), so its rows carry a leading ~ even
 * when the headline is exact spend — they're an estimate of where the cost went, not a breakdown of the bill.
 */
export function CostPanel({
  usage,
  model,
  liveCostUsd,
  billingMode,
}: {
  usage: Usage;
  model: Family;
  liveCostUsd?: number;
  billingMode?: "subscription" | "api" | "unknown";
}) {
  const { headline, rows, cacheSavings } = useMemo(() => {
    const b = costBreakdown(usage, model);
    return {
      headline: costDisplay({
        liveCostUsd,
        equivApiValueUsd: b.total,
        billingMode,
      }),
      // Color rides on each row so the donut and the legend key off one pairing — no zip-by-index that
      // could drift if a row is added or reordered.
      rows: [
        { label: "Input", value: b.input, color: COST_SEGMENT_COLORS[0] },
        { label: "Output", value: b.output, color: COST_SEGMENT_COLORS[1] },
        {
          label: "Cache read",
          value: b.cacheRead,
          color: COST_SEGMENT_COLORS[2],
        },
        {
          label: "Cache write",
          value: b.cacheWrite,
          color: COST_SEGMENT_COLORS[3],
        },
      ],
      cacheSavings: b.cacheSavings,
    };
  }, [usage, model, liveCostUsd, billingMode]);
  return (
    <PanelSection>
      <PanelHeading
        info={COST_INFO}
        right={
          <span
            className="font-mono text-sm tabular-nums text-fg"
            title={
              headline.equivalent
                ? "Equivalent API value (estimate)"
                : "Actual API spend"
            }
          >
            {headline.text}
          </span>
        }
      >
        Cost
      </PanelHeading>
      <div className="flex items-center gap-3.5">
        <Donut
          segments={rows.map((r) => ({ value: r.value, color: r.color }))}
        />
        <div className="flex-1 space-y-1">
          {rows.map((r) => (
            <MetricRow
              key={r.label}
              label={r.label}
              value={`~${formatUsd(r.value)}`}
              tone="text-fg-faint"
              swatch={r.color}
            />
          ))}
        </div>
      </div>
      {cacheSavings > 0 && (
        <div className="flex items-baseline justify-between border-t border-ink-850 pt-1.5">
          <span className="text-[11px] text-ok">Cache savings</span>
          <span className="font-mono text-[11px] tabular-nums text-ok">
            ~{formatUsd(cacheSavings)}
          </span>
        </div>
      )}
      <p className="text-[10px] leading-snug text-fg-faint">
        Split is Equivalent API value by token kind.
      </p>
    </PanelSection>
  );
}
