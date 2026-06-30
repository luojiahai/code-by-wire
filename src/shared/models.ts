/** The model families the app knows: the `claude --model` aliases. The alias is the unit — it is the
 *  spawn flag, the substring that detects the family in a raw transcript string, and the window
 *  key. The exact resolved version is read back from the session, never pinned here, so a new model
 *  *version* needs no edit; only a brand-new *family* is a one-line add. */
export const FAMILIES = ["opus", "sonnet", "haiku", "fable"] as const;

export type Family = (typeof FAMILIES)[number];

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
}

const STANDARD_WINDOW = 200_000;

// One row per family: the alias and the standard 200K window.
const SPECS: readonly FamilySpec[] = [
  { alias: "opus", contextWindow: STANDARD_WINDOW },
  { alias: "sonnet", contextWindow: STANDARD_WINDOW },
  { alias: "haiku", contextWindow: STANDARD_WINDOW },
  { alias: "fable", contextWindow: STANDARD_WINDOW },
];

/** Fallback for a raw string matching no known family. Opus is the neutral conventional default: a
 *  modelless session (only `<synthetic>` turns, no real model recorded — often one that errored at
 *  startup) carries no usage, and "Opus" reads as a plausible default rather than alarming the user
 *  by labeling it the rare Fable. A genuinely unrecognized model string that *did* run is shown by
 *  its raw id via the honest label, not by this fallback family. Adding the new family to SPECS
 *  above is the real fix when one ships. */
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
 *  An unrecognized string falls to DEFAULT_SPEC, the Opus fallback for window. */
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
