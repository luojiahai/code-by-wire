import type { Family } from "@shared/types";
import {
  resolvePricing,
  type ModelPricing,
  type PricingOverrides,
} from "@shared/models";
import { FAMILY_LABEL } from "./meta";

/** The five token kinds shown across the app, in the session-panel grouping order (fresh → cached). Each
 *  carries its display label, the popover description (spec copy), and the ModelPricing field its live rate
 *  reads from. The two cache-write kinds are the indented sub-rows of the grouped "Cache write" row. */
export interface TokenKind {
  key: "input" | "output" | "cacheRead" | "cacheWrite5m" | "cacheWrite1h";
  label: string;
  description: string;
  rateField: keyof ModelPricing;
}

export const TOKEN_KINDS: TokenKind[] = [
  {
    key: "input",
    label: "Input",
    rateField: "input",
    description: "Fresh prompt tokens processed this session, at full price.",
  },
  {
    key: "output",
    label: "Output",
    rateField: "output",
    description: "Tokens the model generated.",
  },
  {
    key: "cacheRead",
    label: "Cache read",
    rateField: "cacheRead",
    description:
      "Context replayed from cache instead of reprocessed, ~10% of input price.",
  },
  {
    key: "cacheWrite5m",
    label: "Cache write 5m",
    rateField: "cacheWrite5m",
    description:
      "Context written into the 5-minute cache so the next turn replays it cheaply. 1.25× input.",
  },
  {
    key: "cacheWrite1h",
    label: "Cache write 1h",
    rateField: "cacheWrite1h",
    description:
      "Context written into the longer-lived 1-hour cache. 2× input.",
  },
];

/** A kind's live $/1M rate for a model, naming the model: "$6.25 / 1M · Opus". Exact (no rounding beyond
 *  two decimals), honoring any user override. */
export function kindRateLabel(
  kind: TokenKind,
  model: Family,
  overrides?: PricingOverrides,
): string {
  const rate = resolvePricing(model, overrides)[kind.rateField];
  const n = rate.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `$${n} / 1M · ${FAMILY_LABEL[model]}`;
}
