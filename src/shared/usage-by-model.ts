import type { ModelUsage, Usage } from "./types";
import {
  costBreakdown,
  normalizeModelId,
  type CostBreakdown,
  type Family,
  type PricingOverrides,
} from "./models";

/** A zeroed Usage — the additive identity for sumUsages. */
export function emptyUsage(): Usage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  };
}

/** Sum a list of Usage records field by field. */
export function sumUsages(usages: Usage[]): Usage {
  const out = emptyUsage();
  for (const u of usages) {
    out.inputTokens += u.inputTokens;
    out.outputTokens += u.outputTokens;
    out.cacheReadTokens += u.cacheReadTokens;
    out.cacheCreationTokens += u.cacheCreationTokens;
    out.cacheCreation5mTokens += u.cacheCreation5mTokens;
    out.cacheCreation1hTokens += u.cacheCreation1hTokens;
  }
  return out;
}

/** Total tokens (input + output + cacheRead + cacheCreation). cacheCreationTokens is the authoritative
 *  5m+1h total, so the two splits aren't double-counted — mirrors the panel's `total` and the overview's
 *  `totalTokens`. */
export function tokenTotal(u: Usage): number {
  return (
    u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreationTokens
  );
}

/** Price one model's usage to a per-kind CostBreakdown, or null (n/a) when modelRaw is absent.
 *  A raw id that matches no known family falls back to the default family (Opus), so non-Anthropic
 *  providers still get a meaningful cost estimate. Pricing overrides on the fallback family apply. */
export function modelUsageCost(
  mu: ModelUsage,
  overrides?: PricingOverrides,
): CostBreakdown | null {
  const raw = mu.modelRaw ?? undefined;
  if (raw == null) return null; // genuinely absent model → n/a
  return costBreakdown(mu.usage, normalizeModelId(raw), overrides);
}

/** One model's row in the panel view: its raw id, usage, total tokens, and breakdown (null → no model recorded). */
export interface ModelUsageView {
  modelRaw: string | null;
  usage: Usage;
  totalTokens: number;
  cost: CostBreakdown | null;
}

/** The Tokens panel's whole data source for a session's per-model breakdown: the combined token usage
 *  (every model, recognized or not), the combined per-kind cost (summed across all models (unrecognized ids priced at the default family rate), each at
 *  its own rate), the per-model rows (biggest-tokens first) for the attribution line and popovers, and
 *  whether any present model carries a pricing override (which drops the live-cost headline).
 *  Pure and JSX-free, so it typechecks under tsconfig.node.json and is unit-testable. */
export interface UsageByModelView {
  usage: Usage;
  totalTokens: number;
  cost: CostBreakdown;
  models: ModelUsageView[];
  anyOverride: boolean;
}

function zeroCost(): CostBreakdown {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    cacheWrite: 0,
    total: 0,
    cacheSavings: 0,
  };
}

export function viewUsageByModel(
  models: ModelUsage[],
  overrides?: PricingOverrides,
): UsageByModelView {
  const cost = zeroCost();
  let anyOverride = false;
  const rows = models.map((mu): ModelUsageView => {
    const raw = mu.modelRaw ?? undefined;
    // Compute family once per model — used by cost computation and the override check below.
    const family: Family = normalizeModelId(raw);
    const c = raw != null ? costBreakdown(mu.usage, family, overrides) : null;
    if (c) {
      cost.input += c.input;
      cost.output += c.output;
      cost.cacheRead += c.cacheRead;
      cost.cacheWrite5m += c.cacheWrite5m;
      cost.cacheWrite1h += c.cacheWrite1h;
      cost.cacheWrite += c.cacheWrite;
      cost.total += c.total;
      cost.cacheSavings += c.cacheSavings;
    }
    // Check for overrides unconditionally: an unrecognized model still normalizes to a family, and
    // a user override for that family should suppress liveCostUsd in the headline even when c is null.
    if (overrides && Object.keys(overrides[family] ?? {}).length > 0)
      anyOverride = true;
    return {
      modelRaw: mu.modelRaw,
      usage: mu.usage,
      totalTokens: tokenTotal(mu.usage),
      cost: c,
    };
  });
  rows.sort(
    (a, b) =>
      b.totalTokens - a.totalTokens ||
      (a.modelRaw ?? "").localeCompare(b.modelRaw ?? ""),
  );
  return {
    usage: sumUsages(models.map((m) => m.usage)),
    totalTokens: rows.reduce((n, r) => n + r.totalTokens, 0),
    cost,
    models: rows,
    anyOverride,
  };
}

/** The reconciled multi-model Equivalent API value: each model priced at its own rate, summed;
 *  unrecognized ids fall back to the default family (Opus), so every non-null modelRaw contributes cost. The headline figure hydrate stores and the panel
 *  recomputes with live overrides. */
export function equivApiValueByModel(
  models: ModelUsage[],
  overrides?: PricingOverrides,
): number {
  return viewUsageByModel(models, overrides).cost.total;
}
