import type { Usage } from "@shared/types";
import { formatTokensShort } from "@shared/format";
import { Swatch } from "../../ui/atoms";
import { StackedBar } from "../../ui/charts";
import { TOKEN_SEGMENT_COLORS } from "../../ui/meta";
import { PanelSection, PanelHeading } from "./chrome";

const TOKENS_INFO =
  "Total tokens this session: fresh input, generated output, and cached reads/writes. Cached tokens are replayed context, far cheaper than fresh input.";

/** Token totals from the session's summed usage, as a stacked bar of Input / Output / Cached. Cached =
 *  cache-read + cache-creation; the stacked bar (not a donut) keeps the cache-heavy mix legible. */
export function TokensPanel({ usage }: { usage: Usage }) {
  const cached = usage.cacheReadTokens + usage.cacheCreationTokens;
  const total = usage.inputTokens + usage.outputTokens + cached;
  const legend = [
    { label: "In", value: usage.inputTokens, color: TOKEN_SEGMENT_COLORS[0] },
    { label: "Out", value: usage.outputTokens, color: TOKEN_SEGMENT_COLORS[1] },
    { label: "Cached", value: cached, color: TOKEN_SEGMENT_COLORS[2] },
  ];
  return (
    <PanelSection>
      <PanelHeading
        info={TOKENS_INFO}
        right={
          <span className="font-mono text-[12px] tabular-nums text-fg-muted">
            {formatTokensShort(total)}
          </span>
        }
      >
        Tokens
      </PanelHeading>
      <StackedBar
        className="mt-1"
        segments={legend.map((l) => ({ value: l.value, color: l.color }))}
      />
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <Swatch color={l.color} />
            <span className="text-fg-muted">{l.label}</span>
            <span className="font-mono tabular-nums text-fg">
              {formatTokensShort(l.value)}
            </span>
          </span>
        ))}
      </div>
    </PanelSection>
  );
}
