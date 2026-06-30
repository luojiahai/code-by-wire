import type { ModelUsage, Usage } from "./types";

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

/** One model's row in the panel view: its raw id, usage, and total tokens. */
export interface ModelUsageView {
  modelRaw: string | null;
  usage: Usage;
  totalTokens: number;
}

/** The Tokens panel's whole data source for a session's per-model breakdown: the combined token usage
 *  (every model, recognized or not), the per-model rows (biggest-tokens first) for the attribution
 *  line and popovers. Pure and JSX-free, so it typechecks under tsconfig.node.json and is unit-testable. */
export interface UsageByModelView {
  usage: Usage;
  totalTokens: number;
  models: ModelUsageView[];
}

export function viewUsageByModel(models: ModelUsage[]): UsageByModelView {
  const rows = models.map((mu): ModelUsageView => ({
    modelRaw: mu.modelRaw,
    usage: mu.usage,
    totalTokens: tokenTotal(mu.usage),
  }));
  rows.sort(
    (a, b) =>
      b.totalTokens - a.totalTokens ||
      (a.modelRaw ?? "").localeCompare(b.modelRaw ?? ""),
  );
  return {
    usage: sumUsages(models.map((m) => m.usage)),
    totalTokens: rows.reduce((n, r) => n + r.totalTokens, 0),
    models: rows,
  };
}
