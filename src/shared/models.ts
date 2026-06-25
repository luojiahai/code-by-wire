import type { Usage } from "./types";

/** The model families the app knows: the `claude --model` aliases. The alias is the unit — it is the
 *  spawn flag, the substring that detects the family in a raw transcript string, and the pricing/window
 *  key. The exact resolved version is read back from the session, never pinned here, so a new model
 *  *version* needs no edit; only a brand-new *family* is a one-line add. */
export const FAMILIES = ["opus", "sonnet", "haiku", "fable"] as const;

export type Family = (typeof FAMILIES)[number];

/** USD per million tokens, by token kind. cacheWrite5m is the 5-minute cache-creation rate
 *  (1.25× input); cacheWrite1h is the longer-lived 1-hour rate (2× input). */
export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

/** Per-family resolved id from `ANTHROPIC_DEFAULT_<FAMILY>_MODEL`, the configured default, and the
 *  `availableModels` allowlist — read main-side from settings/env, served to the picker. */
export interface ModelDefaults {
  overrides: Partial<Record<Family, string>>;
  default?: Family;
  allowed?: Family[];
}

interface FamilySpec {
  alias: Family;
  /** Context window the session runs under — the standard 200K fallback for every family. A larger
   *  window (the `[1m]` tag, or Fable's 1M default) isn't derivable from the bare alias; a live
   *  statusLine capture overlays the true context_window_size when present (see overlaySessions). */
  contextWindow: number;
  pricing: ModelPricing;
}

const STANDARD_WINDOW = 200_000;

// One row per family: the alias, the standard 200K window, and API pricing. Cache rates follow the
// standard multipliers every row shares: cacheRead = 0.1x input, cacheWrite5m = 1.25x input,
// cacheWrite1h = 2x input.
const SPECS: readonly FamilySpec[] = [
  {
    alias: "opus",
    contextWindow: STANDARD_WINDOW,
    pricing: {
      input: 5,
      output: 25,
      cacheRead: 0.5,
      cacheWrite5m: 6.25,
      cacheWrite1h: 10,
    },
  },
  {
    alias: "sonnet",
    contextWindow: STANDARD_WINDOW,
    pricing: {
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite5m: 3.75,
      cacheWrite1h: 6,
    },
  },
  {
    alias: "haiku",
    contextWindow: STANDARD_WINDOW,
    pricing: {
      input: 1,
      output: 5,
      cacheRead: 0.1,
      cacheWrite5m: 1.25,
      cacheWrite1h: 2,
    },
  },
  {
    alias: "fable",
    contextWindow: STANDARD_WINDOW,
    pricing: {
      input: 10,
      output: 50,
      cacheRead: 1.0,
      cacheWrite5m: 12.5,
      cacheWrite1h: 20,
    },
  },
];

/** Fallback for a raw string matching no known family. Opus is the neutral conventional default: a
 *  modelless session (only `<synthetic>` turns, no real model recorded — often one that errored at
 *  startup) carries no usage, so the rate never bites, and "Opus" reads as a plausible default rather
 *  than alarming the user by labeling it the rare, priciest Fable. A genuinely unrecognized model string
 *  that *did* run is shown by its raw id via the honest label, not by this fallback family, so the
 *  fallback only ever fronts a zero-cost session. Adding the new family to SPECS above is the real fix
 *  when one ships. */
const DEFAULT_SPEC = SPECS.find((s) => s.alias === "opus") ?? SPECS[0];

/** The spec for a family; DEFAULT_SPEC if somehow unmatched. */
function specByFamily(model: Family): FamilySpec {
  return SPECS.find((s) => s.alias === model) ?? DEFAULT_SPEC;
}

/** The spec for a raw model string, matched by family-alias substring; null when none matches. */
function specForRaw(raw: string | undefined): FamilySpec | null {
  if (raw) {
    for (const spec of SPECS) {
      if (raw.includes(spec.alias)) return spec;
    }
  }
  return null;
}

/** Map a raw model string (a pinned id, a provider-prefixed id, or a `[1m]`-tagged id) to its family.
 *  An unrecognized string falls to DEFAULT_SPEC, the Opus fallback for pricing and window. */
export function normalizeModelId(raw: string | undefined): Family {
  return (specForRaw(raw) ?? DEFAULT_SPEC).alias;
}

/** Whether a raw model string matches a known family. False for a string absent from the table, which
 *  the honest label renders by its statusLine display_name rather than masquerading as the fallback. */
export function isKnownModelString(raw: string | undefined): boolean {
  return specForRaw(raw) !== null;
}

/** Context window (tokens) for a family: the standard 200K. A live statusLine capture overlays the true
 *  size when present; this is only the fallback for an uncaptured session. */
export function contextWindowFor(model: Family): number {
  return specByFamily(model).contextWindow;
}

/** Per-million-token API rates for a family. */
export function priceFor(model: Family): ModelPricing {
  return specByFamily(model).pricing;
}

/** A user's per-family rate overrides: any subset of a family's ModelPricing fields. Stored in
 *  app-settings and merged over the built-in defaults by resolvePricing, so a new model version still
 *  needs zero edits. */
export type PricingOverrides = Partial<Record<Family, Partial<ModelPricing>>>;

/** The effective per-million rates for a family: the built-in defaults, with any user overrides merged
 *  per field on top. The single resolver both the renderer (costBreakdown) and main (analytics equiv)
 *  route through, so the panel and the overview can never price the same tokens differently. */
export function resolvePricing(
  family: Family,
  overrides?: PricingOverrides,
): ModelPricing {
  const base = priceFor(family);
  const o = overrides?.[family];
  return o ? { ...base, ...o } : base;
}

/**
 * Equivalent API value (USD) for a session's summed token usage at the model's API rates. On a
 * subscription account this is a reference figure, not money owed. Rates are per
 * million tokens, so divide the weighted sum by 1e6.
 */
export function equivApiValue(
  usage: Usage,
  model: Family,
  overrides?: PricingOverrides,
): number {
  const p = resolvePricing(model, overrides);
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheCreation5mTokens * p.cacheWrite5m +
      usage.cacheCreation1hTokens * p.cacheWrite1h) /
    1_000_000
  );
}

/** A session's Equivalent API value, split by token kind, plus the cache-hit saving. All USD. */
export interface CostBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  /** Cost of tokens written into the 5-minute cache. */
  cacheWrite5m: number;
  /** Cost of tokens written into the 1-hour cache. */
  cacheWrite1h: number;
  /** cacheWrite5m + cacheWrite1h — the grouped parent total for the panel's "Cache write" row. */
  cacheWrite: number;
  /** Sum of input + output + cacheRead + cacheWrite — equals equivApiValue(usage, model). */
  total: number;
  /** USD the cache reads avoided vs fresh input price; always ≥ 0, reported separately. */
  cacheSavings: number;
}

/**
 * Split a session's summed token usage into per-kind USD at the model's API rates, plus cache-hit
 * savings. The parts sum to equivApiValue(usage, model) (same rates, same /1e6). On a subscription
 * this is all Equivalent API value, not money owed; on an API account it's real spend.
 */
export function costBreakdown(
  usage: Usage,
  model: Family,
  overrides?: PricingOverrides,
): CostBreakdown {
  const p = resolvePricing(model, overrides);
  const input = (usage.inputTokens * p.input) / 1_000_000;
  const output = (usage.outputTokens * p.output) / 1_000_000;
  const cacheRead = (usage.cacheReadTokens * p.cacheRead) / 1_000_000;
  const cacheWrite5m =
    (usage.cacheCreation5mTokens * p.cacheWrite5m) / 1_000_000;
  const cacheWrite1h =
    (usage.cacheCreation1hTokens * p.cacheWrite1h) / 1_000_000;
  const cacheWrite = cacheWrite5m + cacheWrite1h;
  const cacheSavings =
    (usage.cacheReadTokens * (p.input - p.cacheRead)) / 1_000_000;
  return {
    input,
    output,
    cacheRead,
    cacheWrite5m,
    cacheWrite1h,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
    cacheSavings,
  };
}
