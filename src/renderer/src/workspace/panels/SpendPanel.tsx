import { useMemo } from "react";
import type { ModelUsage, Usage } from "@shared/types";
import { viewUsageByModel } from "@shared/usage-by-model";
import { formatUsd } from "@shared/format";
import { MetricTip } from "../../ui/MetricTip";
import type { TokenKind } from "../../ui/token-kinds";
import { useI18n } from "../../i18n";
import { PanelSection, PanelHeading, StatRow } from "./chrome";

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

/** A kind label wrapped in a MetricTip whose popover gives the spec description. Label/description
 *  come from the caller's t.dock.spend.kinds[key] catalog entry, not from TokenKind directly, so
 *  the rendered text translates with the locale (TokenKind's own label/description stay English-only
 *  spec copy used elsewhere in the app). */
function KindLabel({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <MetricTip label={label} popoverClassName={POPOVER}>
      <span className="block font-medium text-fg">{label}</span>
      <span className="mt-0.5 block">{description}</span>
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
  kinds,
  info,
}: {
  usageByModel: ModelUsage[];
  costUsd: number | null;
  /** Which token kinds to render, in order — the caller's agent composition decides
   *  (Claude: TOKEN_KINDS; codex: CORE_TOKEN_KINDS). */
  kinds: TokenKind[];
  /** Heading-popover override: the shared t.dock.spend.info copy describes Claude's 5m/1h
   *  rows and $ accounting, so codex passes t.dock.spend.infoCodex instead. */
  info?: string;
}) {
  const { t } = useI18n();
  const view = useMemo(() => viewUsageByModel(usageByModel), [usageByModel]);
  const { usage } = view;
  const total = view.totalTokens;

  return (
    <PanelSection>
      <PanelHeading icon="coins" info={info ?? t.dock.spend.info}>
        {t.dock.spend.heading}
      </PanelHeading>

      <div className="flex items-baseline justify-between">
        <div className="font-mono text-title font-medium leading-none tabular-nums text-fg">
          {t.numbers.tokensShort(total)}
          <span className="text-xs text-fg-faint"> {t.dock.tokensUnit}</span>
        </div>
        <span className="font-mono text-xs tabular-nums text-(--ui-text-tertiary)">
          {costUsd != null ? formatUsd(costUsd) : "-"}
        </span>
      </div>

      <div className="space-y-1.5">
        {kinds.map((k) => (
          <StatRow
            key={k.key}
            label={<KindLabel {...t.dock.spend.kinds[k.key]} />}
            value={t.numbers.tokensShort(KIND_TOKENS[k.key](usage))}
          />
        ))}
      </div>
    </PanelSection>
  );
}
