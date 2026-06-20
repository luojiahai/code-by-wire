import { useMemo } from "react";
import type { Family, Usage } from "@shared/types";
import { costBreakdown } from "@shared/models";
import { formatUsd, formatTokensShort, costDisplay } from "@shared/format";
import { StackedBar } from "../../ui/charts";
import { Swatch } from "../../ui/atoms";
import { KIND_SEGMENT_COLORS } from "../../ui/meta";
import { PanelSection, PanelHeading } from "./chrome";

const TOKENS_INFO =
  "This session's tokens by kind — fresh input, generated output, and cached reads/writes — with each kind's Equivalent API value. Cached tokens are replayed context, far cheaper than fresh input. Shows real spend instead when the account bills per API call.";

/**
 * The session's token usage and its cost, merged: one breakdown read in both units. A headline of total
 * tokens · the Equivalent API value (Claude's live number when present), a stacked bar of the four token
 * kinds, and a legend pairing each kind's tokens with its ~cost. The per-kind costs are always the computed
 * Equivalent API value (no live split exists), so they carry a leading ~ even when the headline is exact spend.
 */
export function TokensPanel({
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
  const { headline, total, rows, cacheSavings } = useMemo(() => {
    const b = costBreakdown(usage, model);
    return {
      headline: costDisplay({
        liveCostUsd,
        equivApiValueUsd: b.total,
        billingMode,
      }),
      total:
        usage.inputTokens +
        usage.outputTokens +
        usage.cacheReadTokens +
        usage.cacheCreationTokens,
      // Color rides on each row so the bar and the legend key off one pairing — no zip-by-index that
      // could drift if a row is reordered.
      rows: [
        {
          label: "Input",
          tokens: usage.inputTokens,
          usd: b.input,
          color: KIND_SEGMENT_COLORS[0],
        },
        {
          label: "Output",
          tokens: usage.outputTokens,
          usd: b.output,
          color: KIND_SEGMENT_COLORS[1],
        },
        {
          label: "Cache read",
          tokens: usage.cacheReadTokens,
          usd: b.cacheRead,
          color: KIND_SEGMENT_COLORS[2],
        },
        {
          label: "Cache write",
          tokens: usage.cacheCreationTokens,
          usd: b.cacheWrite,
          color: KIND_SEGMENT_COLORS[3],
        },
      ],
      cacheSavings: b.cacheSavings,
    };
  }, [usage, model, liveCostUsd, billingMode]);
  return (
    <PanelSection>
      <PanelHeading
        info={TOKENS_INFO}
        right={
          <span
            className="font-mono text-[13px] tabular-nums text-fg"
            title={
              headline.equivalent
                ? "Total tokens · Equivalent API value (estimate)"
                : "Total tokens · actual API spend"
            }
          >
            {formatTokensShort(total)}
            <span className="text-fg-faint"> · {headline.text}</span>
          </span>
        }
      >
        Tokens
      </PanelHeading>
      <StackedBar
        className="mt-1"
        segments={rows.map((r) => ({ value: r.tokens, color: r.color }))}
      />
      <div className="mt-2.5 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-[12px]">
            <Swatch color={r.color} />
            <span className="flex-1 text-fg-muted">{r.label}</span>
            <span className="font-mono tabular-nums text-fg">
              {formatTokensShort(r.tokens)}
            </span>
            <span className="w-12 text-right font-mono text-[11px] tabular-nums text-fg-faint">
              ~{formatUsd(r.usd)}
            </span>
          </div>
        ))}
      </div>
      {cacheSavings > 0 && (
        <div className="mt-2.5 flex items-baseline justify-between border-t border-ink-850 pt-2 text-[11px]">
          <span className="text-fg-muted">Cache savings</span>
          <span className="font-mono tabular-nums text-ok">
            ~{formatUsd(cacheSavings)}
          </span>
        </div>
      )}
    </PanelSection>
  );
}
