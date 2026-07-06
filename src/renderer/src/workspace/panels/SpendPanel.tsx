import { useMemo } from "react";
import type { ModelUsage, Usage } from "@shared/types";
import { viewUsageByModel } from "@shared/usage-by-model";
import { formatTokensShort, formatUsd } from "@shared/format";
import { MetricTip } from "../../ui/MetricTip";
import { TOKEN_KINDS, type TokenKind } from "../../ui/token-kinds";
import { PanelSection, PanelHeading, StatRow } from "./chrome";

const SPEND_INFO =
  "What this session has consumed: total tokens by kind — fresh input, generated output, cached reads, and the 5-minute and 1-hour cache writes. The $ is Claude Code's own session accounting; on a subscription it is the API-equivalent value, not a bill.";

const POPOVER =
  "absolute left-0 top-full z-20 mt-1 w-60 rounded-md border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] px-2.5 py-2 text-left text-xs leading-snug text-(--ui-text-secondary) shadow-(--shadow-md) backdrop-blur-xl";

/** TokenKind.key → the matching Usage token field, so the kind rows read off one mapping. */
const KIND_TOKENS: Record<TokenKind["key"], (u: Usage) => number> = {
  input: (u) => u.inputTokens,
  output: (u) => u.outputTokens,
  cacheRead: (u) => u.cacheReadTokens,
  cacheWrite5m: (u) => u.cacheCreation5mTokens,
  cacheWrite1h: (u) => u.cacheCreation1hTokens,
};

/** A kind label wrapped in a MetricTip whose popover gives the spec description. */
function KindLabel({ kind }: { kind: TokenKind }) {
  return (
    <MetricTip label={kind.label} popoverClassName={POPOVER}>
      <span className="block font-medium text-fg">{kind.label}</span>
      <span className="mt-0.5 block">{kind.description}</span>
    </MetricTip>
  );
}

/**
 * The cockpit's spend instrument (cockpit spec §Spend): a paired headline — total tokens large,
 * Claude Code's $ small on the same baseline — over one flat row per kind. Deliberately no
 * part-to-whole chart: cache reads dominate real usage by orders of magnitude, so a stacked bar
 * always rendered as one solid strip; the tabular rows carry the proportions honestly. Tokens are
 * combined across models; the old by-model attribution is deliberately gone.
 */
export function SpendPanel({
  usageByModel,
  costUsd,
}: {
  usageByModel: ModelUsage[];
  costUsd: number | null;
}) {
  const view = useMemo(() => viewUsageByModel(usageByModel), [usageByModel]);
  const { usage } = view;
  const total = view.totalTokens;

  return (
    <PanelSection>
      <PanelHeading icon="coins" info={SPEND_INFO}>
        Spend
      </PanelHeading>

      <div className="flex items-baseline justify-between">
        <div className="font-mono text-title font-medium leading-none tabular-nums text-fg">
          {formatTokensShort(total)}
          <span className="text-xs text-fg-faint"> tokens</span>
        </div>
        <span className="font-mono text-xs tabular-nums text-(--ui-text-quaternary)">
          {costUsd != null ? formatUsd(costUsd) : "-"}
        </span>
      </div>

      <div className="space-y-1.5">
        {TOKEN_KINDS.map((k) => (
          <StatRow
            key={k.key}
            label={<KindLabel kind={k} />}
            value={formatTokensShort(KIND_TOKENS[k.key](usage))}
          />
        ))}
      </div>
    </PanelSection>
  );
}
