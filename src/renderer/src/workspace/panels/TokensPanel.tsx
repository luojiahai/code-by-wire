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
  "This session's tokens by kind — fresh input, generated output, cached reads, and the 5-minute and 1-hour cache writes — with each kind's Equivalent API value. Cached tokens are replayed context, far cheaper than fresh input. Shows real spend instead when the account bills per API call.";

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
 * The session's token usage and its cost, grouped: a headline of total tokens · the Equivalent API value
 * (Claude's live number when present), a 5-segment stacked bar (Input · Output · Cache read · 5m write · 1h
 * write), and rows pairing each kind's tokens with its ~cost. Cache write is a grouped parent total with
 * indented 5-minute / 1-hour sub-rows; the 1-hour row dims to `0 / —` when the session never used 1h
 * caching. The ✎ in the header opens the pricing editor; each kind label reveals its description + live rate.
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
  const { headline, total, bar, topRows, subRows, cacheSavings } =
    useMemo(() => {
      const b = costBreakdown(usage, model, pricingOverrides);
      return {
        headline: costDisplay({
          liveCostUsd,
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
        topRows: [
          {
            kind: KIND_BY_KEY.input,
            tokens: usage.inputTokens,
            usd: b.input,
            color: KIND_SEGMENT_COLORS[0],
          },
          {
            kind: KIND_BY_KEY.output,
            tokens: usage.outputTokens,
            usd: b.output,
            color: KIND_SEGMENT_COLORS[1],
          },
          {
            kind: KIND_BY_KEY.cacheRead,
            tokens: usage.cacheReadTokens,
            usd: b.cacheRead,
            color: KIND_SEGMENT_COLORS[2],
          },
        ],
        subRows: [
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

  const cacheWriteTokens = usage.cacheCreationTokens;
  const cacheWriteUsd = subRows[0].usd + subRows[1].usd;

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
        {topRows.map((r) => (
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
          />
        ))}
        {/* Grouped Cache write parent total (no swatch — its two sub-rows carry the colors). */}
        <div className="flex items-center gap-2 text-[12px]">
          <span className="w-3" />
          <span className="flex-1 text-fg-muted">Cache write</span>
          <span className="font-mono tabular-nums text-fg">
            {formatTokensShort(cacheWriteTokens)}
          </span>
          <span className="w-12 text-right font-mono text-[11px] tabular-nums text-fg-faint">
            ~{formatUsd(cacheWriteUsd)}
          </span>
        </div>
        {subRows.map((r) => (
          <div
            key={r.kind.key}
            className={`flex items-center gap-2 pl-3 text-[12px] ${r.dim ? "opacity-40" : ""}`}
          >
            <Swatch color={r.color} />
            <span className="flex-1 text-fg-muted">
              <KindLabel
                kind={r.kind}
                model={model}
                overrides={pricingOverrides}
              />
            </span>
            <span className="font-mono tabular-nums text-fg">
              {r.dim ? "0" : formatTokensShort(r.tokens)}
            </span>
            <span className="w-12 text-right font-mono text-[11px] tabular-nums text-fg-faint">
              {r.dim ? "—" : `~${formatUsd(r.usd)}`}
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

/** A top-level kind row: swatch · MetricTip label · tokens · ~cost. */
function Row({
  label,
  color,
  tokens,
  usd,
}: {
  label: React.ReactNode;
  color: string;
  tokens: number;
  usd: number;
}) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <Swatch color={color} />
      <span className="flex-1 text-fg-muted">{label}</span>
      <span className="font-mono tabular-nums text-fg">
        {formatTokensShort(tokens)}
      </span>
      <span className="w-12 text-right font-mono text-[11px] tabular-nums text-fg-faint">
        ~{formatUsd(usd)}
      </span>
    </div>
  );
}
