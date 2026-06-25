import { useId, useMemo, useState, type ReactNode } from "react";
import type { Family, ModelUsage, Usage } from "@shared/types";
import {
  isKnownModelString,
  normalizeModelId,
  type CostBreakdown,
  type PricingOverrides,
} from "@shared/models";
import { viewUsageByModel, type ModelUsageView } from "@shared/usage-by-model";
import { formatUsd, formatTokensShort, costDisplay } from "@shared/format";
import { StackedBar } from "../../ui/charts";
import { Swatch } from "../../ui/atoms";
import { KIND_SEGMENT_COLORS, FAMILY_LABEL, modelColorOf } from "../../ui/meta";
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
  "This session's tokens by kind: fresh input, generated output, cached reads, and the 5-minute and 1-hour cache writes, each paired with its Equivalent API value. When subagents ran, usage spans models, each priced at its own rate, with a per-model breakdown one hover away. Shows real spend instead when the account bills per API call.";

const POPOVER =
  "absolute left-0 top-full z-20 mt-1 w-60 rounded-md border border-ink-700 bg-ink-900 px-2.5 py-2 text-left text-[11px] leading-snug text-fg-muted shadow-lg";

// The by-model row popover. Anchored to the row's left edge (the row spans the panel's content), so at
// w-56 (224px) it stays inside the 256px content box — the inline chips it replaced anchored left-0 on a
// right-side chip, running the 240px popover off the rail. Used directly (not via MetricTip), so it carries
// its own reveal classes.
const MODEL_POPOVER =
  "absolute left-0 top-full z-20 mt-1 hidden w-56 rounded-md border border-ink-700 bg-ink-900 px-2.5 py-2 text-left text-[11px] leading-snug text-fg-muted shadow-lg group-hover:block group-focus-within:block";

/** TokenKind.key → the matching Usage token field and CostBreakdown USD field, so the per-model popover
 *  and the kind rows read off one mapping. */
const KIND_TOKENS: Record<TokenKind["key"], (u: Usage) => number> = {
  input: (u) => u.inputTokens,
  output: (u) => u.outputTokens,
  cacheRead: (u) => u.cacheReadTokens,
  cacheWrite5m: (u) => u.cacheCreation5mTokens,
  cacheWrite1h: (u) => u.cacheCreation1hTokens,
};
const KIND_COST: Record<TokenKind["key"], (c: CostBreakdown) => number> = {
  input: (c) => c.input,
  output: (c) => c.output,
  cacheRead: (c) => c.cacheRead,
  cacheWrite5m: (c) => c.cacheWrite5m,
  cacheWrite1h: (c) => c.cacheWrite1h,
};

const KIND_BY_KEY = Object.fromEntries(
  TOKEN_KINDS.map((k) => [k.key, k]),
) as Record<TokenKind["key"], TokenKind>;

/** A model's short attribution label: the Title-Case family ("Opus"), the raw id for an unrecognized
 *  model (honest, never the Opus fallback), or "Unknown" for a turn that recorded none. */
function modelLabel(modelRaw: string | null): string {
  if (modelRaw == null) return "Unknown";
  if (isKnownModelString(modelRaw))
    return FAMILY_LABEL[normalizeModelId(modelRaw)];
  return modelRaw;
}

/** A kind label wrapped in a MetricTip whose popover gives the spec description plus, for a single-model
 *  session, the live $/1M rate for that model (honoring any override). In a multi-model session the
 *  per-model rates live in the attribution popovers, so the rate line is omitted here. */
function KindLabel({
  kind,
  model,
  overrides,
}: {
  kind: TokenKind;
  model?: Family;
  overrides?: PricingOverrides;
}) {
  return (
    <MetricTip label={kind.label} popoverClassName={POPOVER}>
      <span className="block font-medium text-fg">{kind.label}</span>
      <span className="mt-0.5 block">{kind.description}</span>
      {model && (
        <span className="mt-1 block font-mono text-[10.5px] text-fg-faint">
          {kindRateLabel(kind, model, overrides)}
        </span>
      )}
    </MetricTip>
  );
}

/** One model's row in the "by model" list: an identity dot in its family's Aurora hue (the same color the
 *  model wears in the Usage overview), the model name, its total tokens, and ~cost. Shares the same
 *  columns as the kind rows below, so attribution and the combined breakdown read as one rack. The whole row is the
 *  hover/focus target; its popover carries the full 5-kind breakdown (tokens · ~USD, or n/a for an
 *  unrecognized model) plus per-kind rates for recognized models, and a subtotal, anchored to the row's
 *  left so it stays inside the rail. */
function ModelRow({
  m,
  overrides,
}: {
  m: ModelUsageView;
  overrides?: PricingOverrides;
}) {
  const name = modelLabel(m.modelRaw);
  const tipId = useId();
  const family = isKnownModelString(m.modelRaw ?? undefined)
    ? normalizeModelId(m.modelRaw ?? undefined)
    : null;
  return (
    <div className="group relative">
      <div
        tabIndex={0}
        aria-describedby={tipId}
        // -mx-1 px-1: the hover/focus highlight bleeds 4px into the panel padding while the dot stays at
        // x=0, column-aligned with the kind rows below (which have no horizontal padding).
        className="-mx-1 flex cursor-help items-center gap-2 rounded px-1 py-0.5 text-[12px] transition-colors hover:bg-ink-850 focus-visible:bg-ink-850 focus-visible:outline-none"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: modelColorOf(m.modelRaw) }}
        />
        <span className="flex-1 truncate text-fg-muted">{name}</span>
        <span className="font-mono tabular-nums text-fg">
          {formatTokensShort(m.totalTokens)}
        </span>
        <span className="w-12 text-right font-mono text-[11px] tabular-nums text-fg-faint">
          {m.cost ? `~${formatUsd(m.cost.total)}` : "n/a"}
        </span>
      </div>
      <span role="tooltip" id={tipId} className={MODEL_POPOVER}>
        <span className="block font-medium text-fg">{name}</span>
        <span className="mt-1 block space-y-0.5">
          {TOKEN_KINDS.map((k) => (
            <span
              key={k.key}
              className="flex items-baseline justify-between gap-3"
            >
              <span>
                {k.label}
                {family && (
                  <span className="block font-mono text-[9.5px] leading-tight text-fg-faint/70">
                    {kindRateLabel(k, family, overrides)}
                  </span>
                )}
              </span>
              <span className="font-mono tabular-nums text-fg">
                {formatTokensShort(KIND_TOKENS[k.key](m.usage))}
                <span className="text-fg-faint">
                  {" · "}
                  {m.cost ? `~${formatUsd(KIND_COST[k.key](m.cost))}` : "n/a"}
                </span>
              </span>
            </span>
          ))}
        </span>
        <span className="mt-1 flex items-baseline justify-between gap-3 border-t border-ink-700 pt-1">
          <span className="font-medium text-fg">Subtotal</span>
          <span className="font-mono tabular-nums text-fg">
            {m.cost ? `~${formatUsd(m.cost.total)}` : "n/a"}
          </span>
        </span>
      </span>
    </div>
  );
}

/**
 * The session's token usage and its cost, reconciled with the Usage overview: a headline of total tokens ·
 * the Equivalent API value (Claude's live number when present), a 5-segment stacked bar, one flat row per
 * kind pairing its tokens with its ~cost (summed across every model at each model's own rate), and, when
 * more than one model touched the session, a "by model" attribution list, one row per model in its Aurora
 * identity hue, each row revealing that model's full breakdown on hover. The ✎ opens the pricing editor;
 * each kind label reveals its description (and, single-model, its live rate).
 */
export function TokensPanel({
  usageByModel,
  model,
  liveCostUsd,
  billingMode,
  anthropicDirect,
  pricingOverrides,
  onPricingChange,
}: {
  usageByModel: ModelUsage[];
  model: Family;
  liveCostUsd?: number;
  billingMode?: "subscription" | "api" | "unknown";
  anthropicDirect?: boolean;
  pricingOverrides?: PricingOverrides;
  onPricingChange?: (next: PricingOverrides) => void;
}) {
  const [editing, setEditing] = useState(false);
  const view = useMemo(
    () => viewUsageByModel(usageByModel, pricingOverrides),
    [usageByModel, pricingOverrides],
  );
  const { usage, cost, models } = view;
  const multiModel = models.length > 1;

  // A custom rate for any present model means the user wants usage valued at THEIR price. Claude's live
  // figure is at standard rates and can't reflect that, so drop it and show the override-priced equivalent.
  const headline = costDisplay({
    liveCostUsd: view.anyOverride ? undefined : liveCostUsd,
    equivApiValueUsd: cost.total,
    billingMode,
    anthropicDirect,
  });

  // The 5 bar segments + flat rows, in cost-palette order, parallel to TOKEN_KINDS. Tokens are combined
  // across models; USD is the summed per-model cost. The 1-hour row dims to `0 / —` when unused.
  const bar = [
    { value: usage.inputTokens, color: KIND_SEGMENT_COLORS[0] },
    { value: usage.outputTokens, color: KIND_SEGMENT_COLORS[1] },
    { value: usage.cacheReadTokens, color: KIND_SEGMENT_COLORS[2] },
    { value: usage.cacheCreation5mTokens, color: KIND_SEGMENT_COLORS[3] },
    { value: usage.cacheCreation1hTokens, color: KIND_SEGMENT_COLORS[4] },
  ];
  const rows = [
    {
      kind: KIND_BY_KEY.input,
      tokens: usage.inputTokens,
      usd: cost.input,
      color: KIND_SEGMENT_COLORS[0],
      dim: false,
    },
    {
      kind: KIND_BY_KEY.output,
      tokens: usage.outputTokens,
      usd: cost.output,
      color: KIND_SEGMENT_COLORS[1],
      dim: false,
    },
    {
      kind: KIND_BY_KEY.cacheRead,
      tokens: usage.cacheReadTokens,
      usd: cost.cacheRead,
      color: KIND_SEGMENT_COLORS[2],
      dim: false,
    },
    {
      kind: KIND_BY_KEY.cacheWrite5m,
      tokens: usage.cacheCreation5mTokens,
      usd: cost.cacheWrite5m,
      color: KIND_SEGMENT_COLORS[3],
      dim: false,
    },
    {
      kind: KIND_BY_KEY.cacheWrite1h,
      tokens: usage.cacheCreation1hTokens,
      usd: cost.cacheWrite1h,
      color: KIND_SEGMENT_COLORS[4],
      dim: usage.cacheCreation1hTokens === 0,
    },
  ];
  const total = view.totalTokens;
  const cacheSavings = cost.cacheSavings;

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
                model={
                  multiModel ? undefined : models[0]?.cost ? model : undefined
                }
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

      {multiModel && (
        <>
          {/* The stacked bar above is the kind rack's legend, so the rack follows it directly; the
              per-model attribution sits below, parted by a hairline — who spent it, after what it bought. */}
          <div className="mt-2.5 h-px bg-ink-800" />
          <div className="mt-2.5">
            <div className="mb-1 text-[11px] text-fg-faint">by model</div>
            <div className="space-y-0.5">
              {models.map((m) => (
                <ModelRow
                  key={m.modelRaw ?? "null"}
                  m={m}
                  overrides={pricingOverrides}
                />
              ))}
            </div>
          </div>
        </>
      )}

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
  label: ReactNode;
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
