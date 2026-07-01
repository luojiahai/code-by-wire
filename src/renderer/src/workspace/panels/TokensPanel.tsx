import { useId, useMemo, type ReactNode } from "react";
import type { ModelUsage, Usage } from "@shared/types";
import { isKnownModelString, normalizeModelId } from "@shared/models";
import { viewUsageByModel, type ModelUsageView } from "@shared/usage-by-model";
import { formatTokensShort } from "@shared/format";
import { StackedBar } from "../../ui/charts";
import { Swatch } from "../../ui/atoms";
import { KIND_SEGMENT_COLORS, FAMILY_LABEL, modelColorOf } from "../../ui/meta";
import { MetricTip } from "../../ui/MetricTip";
import { TOKEN_KINDS, type TokenKind } from "../../ui/token-kinds";
import { PanelSection, PanelHeading } from "./chrome";

const TOKENS_INFO =
  "This session's tokens by kind: fresh input, generated output, cached reads, and the 5-minute and 1-hour cache writes. When subagents ran, usage spans models, each with a per-model breakdown one hover away.";

const POPOVER =
  "absolute left-0 top-full z-20 mt-1 w-60 rounded-md border border-ink-700 bg-ink-900 px-2.5 py-2 text-left text-meta leading-snug text-fg-muted shadow-lg";

// The by-model row popover. Anchored to the row's left edge (the row spans the panel's content), so at
// w-56 (224px) it stays inside the 256px content box — the inline chips it replaced anchored left-0 on a
// right-side chip, running the 240px popover off the rail. Used directly (not via MetricTip), so it carries
// its own reveal classes.
const MODEL_POPOVER =
  "absolute left-0 top-full z-20 mt-1 hidden w-56 rounded-md border border-ink-700 bg-ink-900 px-2.5 py-2 text-left text-meta leading-snug text-fg-muted shadow-lg group-hover:block group-focus-within:block";

/** TokenKind.key → the matching Usage token field, so the per-model popover
 *  and the kind rows read off one mapping. */
const KIND_TOKENS: Record<TokenKind["key"], (u: Usage) => number> = {
  input: (u) => u.inputTokens,
  output: (u) => u.outputTokens,
  cacheRead: (u) => u.cacheReadTokens,
  cacheWrite5m: (u) => u.cacheCreation5mTokens,
  cacheWrite1h: (u) => u.cacheCreation1hTokens,
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

/** A kind label wrapped in a MetricTip whose popover gives the spec description. */
function KindLabel({ kind }: { kind: TokenKind }) {
  return (
    <MetricTip label={kind.label} popoverClassName={POPOVER}>
      <span className="block font-medium text-fg">{kind.label}</span>
      <span className="mt-0.5 block">{kind.description}</span>
    </MetricTip>
  );
}

/** One model's row in the "by model" list: an identity dot in its family's Aurora hue (the same color the
 *  model wears in the Usage overview), the model name, and its total tokens. Shares the same
 *  columns as the kind rows below, so attribution and the combined breakdown read as one rack. The whole row is the
 *  hover/focus target; its popover carries the full 5-kind token breakdown, anchored to the row's
 *  left so it stays inside the rail. */
function ModelRow({ m }: { m: ModelUsageView }) {
  const name = modelLabel(m.modelRaw);
  const tipId = useId();
  return (
    <div className="group relative">
      <div
        tabIndex={0}
        aria-describedby={tipId}
        // -mx-1 px-1: the hover/focus highlight bleeds 4px into the panel padding while the dot stays at
        // x=0, column-aligned with the kind rows below (which have no horizontal padding).
        className="-mx-1 flex cursor-help items-center gap-2 rounded px-1 py-0.5 text-aux transition-colors hover:bg-ink-850 focus-visible:bg-ink-850 focus-visible:outline-none"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: modelColorOf(m.modelRaw) }}
        />
        <span className="flex-1 truncate text-fg-muted">{name}</span>
        <span className="font-mono tabular-nums text-fg">
          {formatTokensShort(m.totalTokens)}
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
              <span>{k.label}</span>
              <span className="font-mono tabular-nums text-fg">
                {formatTokensShort(KIND_TOKENS[k.key](m.usage))}
              </span>
            </span>
          ))}
        </span>
        <span className="mt-1 flex items-baseline justify-between gap-3 border-t border-ink-700 pt-1">
          <span className="font-medium text-fg">Subtotal</span>
          <span className="font-mono tabular-nums text-fg">
            {formatTokensShort(m.totalTokens)}
          </span>
        </span>
      </span>
    </div>
  );
}

/**
 * The session's token usage: a headline of total tokens, a 5-segment stacked bar, one flat row per
 * kind showing its tokens, and, when more than one model touched the session, a "by model" attribution
 * list, one row per model in its Aurora identity hue, each row revealing that model's full breakdown on hover.
 */
export function TokensPanel({ usageByModel }: { usageByModel: ModelUsage[] }) {
  const view = useMemo(() => viewUsageByModel(usageByModel), [usageByModel]);
  const { usage, models } = view;
  const multiModel = models.length > 1;
  const total = view.totalTokens;

  // The 5 bar segments + flat rows, in cost-palette order, parallel to TOKEN_KINDS. Tokens are combined
  // across models.
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
      color: KIND_SEGMENT_COLORS[0],
      dim: false,
    },
    {
      kind: KIND_BY_KEY.output,
      tokens: usage.outputTokens,
      color: KIND_SEGMENT_COLORS[1],
      dim: false,
    },
    {
      kind: KIND_BY_KEY.cacheRead,
      tokens: usage.cacheReadTokens,
      color: KIND_SEGMENT_COLORS[2],
      dim: false,
    },
    {
      kind: KIND_BY_KEY.cacheWrite5m,
      tokens: usage.cacheCreation5mTokens,
      color: KIND_SEGMENT_COLORS[3],
      dim: false,
    },
    {
      kind: KIND_BY_KEY.cacheWrite1h,
      tokens: usage.cacheCreation1hTokens,
      color: KIND_SEGMENT_COLORS[4],
      dim: false,
    },
  ];

  return (
    <PanelSection>
      <PanelHeading
        info={TOKENS_INFO}
        right={
          <span
            className="font-mono text-body tabular-nums text-fg"
            title="Total tokens"
          >
            {formatTokensShort(total)}
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
            label={<KindLabel kind={r.kind} />}
            color={r.color}
            tokens={r.tokens}
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
            <div className="mb-1 text-meta text-fg-faint">by model</div>
            <div className="space-y-0.5">
              {models.map((m) => (
                <ModelRow key={m.modelRaw ?? "null"} m={m} />
              ))}
            </div>
          </div>
        </>
      )}
    </PanelSection>
  );
}

/** One kind row: swatch · MetricTip label · tokens. Dims to `0` when the kind is unused
 *  (the 1-hour cache-write row for a session that never used 1h caching). */
function Row({
  label,
  color,
  tokens,
  dim,
}: {
  label: ReactNode;
  color: string;
  tokens: number;
  dim?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-aux ${dim ? "opacity-40" : ""}`}
    >
      <Swatch color={color} />
      <span className="flex-1 text-fg-muted">{label}</span>
      <span className="font-mono tabular-nums text-fg">
        {dim ? "0" : formatTokensShort(tokens)}
      </span>
    </div>
  );
}
