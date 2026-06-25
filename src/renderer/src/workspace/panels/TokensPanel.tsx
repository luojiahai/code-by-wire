import { useMemo, useState } from "react";
import type { Family, Usage } from "@shared/types";
import { costBreakdown, type PricingOverrides } from "@shared/models";
import { formatUsd, formatTokensShort, costDisplay } from "@shared/format";
import { StackedBar } from "../../ui/charts";
import { Swatch } from "../../ui/atoms";
import { KIND_SEGMENT_COLORS } from "../../ui/meta";
import { MetricTip } from "../../ui/MetricTip";
import {
  TOKEN_KINDS,
  kindRateLabel,
  type TokenKind,
} from "../../ui/token-kinds";
import { PanelSection, PanelHeading } from "./chrome";
import { PricingModal } from "./PricingModal";
import { Icon } from "../../ui/icons";

const TOKENS_INFO =
  "This session's tokens by kind: fresh input, generated output, cached reads, and the 5-minute and 1-hour cache writes, each paired with its Equivalent API value. Cached tokens are replayed context, far cheaper than fresh input. Shows real spend instead when the account bills per API call.";

const POPOVER =
  "absolute left-0 top-full z-20 mt-1 w-52 rounded-md border border-ink-700 bg-ink-900 px-2.5 py-2 text-left text-[11px] leading-snug text-fg-muted shadow-lg";

/** A kind label wrapped in a MetricTip whose popover gives the spec description plus the live $/1M rate for
 *  this session's model (honoring any override). */
function KindLabel({
  kind,
  model,
  overrides,
}: {
  kind: TokenKind;
  model: Family;
  overrides?: PricingOverrides;
}) {
  return (
    <MetricTip label={kind.label} popoverClassName={POPOVER}>
      <span className="block font-medium text-fg">{kind.label}</span>
      <span className="mt-0.5 block">{kind.description}</span>
      <span className="mt-1 block font-mono text-[10.5px] text-fg-faint">
        {kindRateLabel(kind, model, overrides)}
      </span>
    </MetricTip>
  );
}

const KIND_BY_KEY = Object.fromEntries(
  TOKEN_KINDS.map((k) => [k.key, k]),
) as Record<TokenKind["key"], TokenKind>;

/**
 * The session's token usage and its cost: a headline of total tokens · the Equivalent API value (Claude's
 * live number when present), a 5-segment stacked bar (Input · Output · Cache read · 5m write · 1h write), and
 * one flat row per kind pairing its tokens with its ~cost. The 1-hour cache-write row dims to `0 / —` when
 * the session never used 1h caching. The ✎ in the header opens the pricing editor; each kind label reveals
 * its description + live rate.
 */
export function TokensPanel({
  usage,
  model,
  liveCostUsd,
  billingMode,
  anthropicDirect,
  pricingOverrides,
  onPricingChange,
}: {
  usage: Usage;
  model: Family;
  liveCostUsd?: number;
  billingMode?: "subscription" | "api" | "unknown";
  anthropicDirect?: boolean;
  pricingOverrides?: PricingOverrides;
  onPricingChange?: (next: PricingOverrides) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { headline, total, bar, rows, cacheSavings } = useMemo(() => {
    const b = costBreakdown(usage, model, pricingOverrides);
    // A custom rate for this session's model means the user wants usage valued at THEIR price. Claude's
    // live cost figure is at standard rates and can't reflect that, so drop it and show the override-priced
    // equivalent — otherwise the headline would ignore the edit while the per-kind rows below re-price.
    const modelOverridden =
      Object.keys(pricingOverrides?.[model] ?? {}).length > 0;
    return {
      headline: costDisplay({
        liveCostUsd: modelOverridden ? undefined : liveCostUsd,
        equivApiValueUsd: b.total,
        billingMode,
        anthropicDirect,
      }),
      total:
        usage.inputTokens +
        usage.outputTokens +
        usage.cacheReadTokens +
        usage.cacheCreationTokens,
      // The 5 bar segments, in cost-palette order, parallel to TOKEN_KINDS.
      bar: [
        { value: usage.inputTokens, color: KIND_SEGMENT_COLORS[0] },
        { value: usage.outputTokens, color: KIND_SEGMENT_COLORS[1] },
        { value: usage.cacheReadTokens, color: KIND_SEGMENT_COLORS[2] },
        { value: usage.cacheCreation5mTokens, color: KIND_SEGMENT_COLORS[3] },
        { value: usage.cacheCreation1hTokens, color: KIND_SEGMENT_COLORS[4] },
      ],
      // All five kinds as flat rows, in cost-palette order. The 1-hour row dims to `0 / —`
      // when the session never used 1h caching.
      rows: [
        {
          kind: KIND_BY_KEY.input,
          tokens: usage.inputTokens,
          usd: b.input,
          color: KIND_SEGMENT_COLORS[0],
          dim: false,
        },
        {
          kind: KIND_BY_KEY.output,
          tokens: usage.outputTokens,
          usd: b.output,
          color: KIND_SEGMENT_COLORS[1],
          dim: false,
        },
        {
          kind: KIND_BY_KEY.cacheRead,
          tokens: usage.cacheReadTokens,
          usd: b.cacheRead,
          color: KIND_SEGMENT_COLORS[2],
          dim: false,
        },
        {
          kind: KIND_BY_KEY.cacheWrite5m,
          tokens: usage.cacheCreation5mTokens,
          usd: b.cacheWrite5m,
          color: KIND_SEGMENT_COLORS[3],
          dim: false,
        },
        {
          kind: KIND_BY_KEY.cacheWrite1h,
          tokens: usage.cacheCreation1hTokens,
          usd: b.cacheWrite1h,
          color: KIND_SEGMENT_COLORS[4],
          dim: usage.cacheCreation1hTokens === 0,
        },
      ],
      cacheSavings: b.cacheSavings,
    };
  }, [
    usage,
    model,
    liveCostUsd,
    billingMode,
    anthropicDirect,
    pricingOverrides,
  ]);

  return (
    <PanelSection>
      <PanelHeading
        info={TOKENS_INFO}
        right={
          <span className="flex items-center gap-1.5">
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
            {onPricingChange && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Edit pricing"
                title="Edit pricing"
                className="text-fg-faint transition-colors hover:text-primary"
              >
                <Icon name="pencil" size={12} />
              </button>
            )}
          </span>
        }
      >
        Tokens
      </PanelHeading>

      <StackedBar className="mt-1" segments={bar} />

      <div className="mt-2.5 space-y-1.5">
        {rows.map((r) => (
          <Row
            key={r.kind.key}
            label={
              <KindLabel
                kind={r.kind}
                model={model}
                overrides={pricingOverrides}
              />
            }
            color={r.color}
            tokens={r.tokens}
            usd={r.usd}
            dim={r.dim}
          />
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

      {editing && onPricingChange && (
        <PricingModal
          overrides={pricingOverrides ?? {}}
          onChange={onPricingChange}
          highlightFamily={model}
          onClose={() => setEditing(false)}
        />
      )}
    </PanelSection>
  );
}

/** One kind row: swatch · MetricTip label · tokens · ~cost. Dims to `0 / —` when the kind is unused
 *  (the 1-hour cache-write row for a session that never used 1h caching). */
function Row({
  label,
  color,
  tokens,
  usd,
  dim,
}: {
  label: React.ReactNode;
  color: string;
  tokens: number;
  usd: number;
  dim?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-[12px] ${dim ? "opacity-40" : ""}`}
    >
      <Swatch color={color} />
      <span className="flex-1 text-fg-muted">{label}</span>
      <span className="font-mono tabular-nums text-fg">
        {dim ? "0" : formatTokensShort(tokens)}
      </span>
      <span className="w-12 text-right font-mono text-[11px] tabular-nums text-fg-faint">
        {dim ? "—" : `~${formatUsd(usd)}`}
      </span>
    </div>
  );
}
