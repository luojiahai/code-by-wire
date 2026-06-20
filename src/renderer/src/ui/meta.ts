import type { SessionState } from "@shared/types";
import {
  isKnownModelString,
  normalizeModelId,
  type Family,
} from "@shared/models";

export interface StateMeta {
  label: string;
  /** Tailwind bg class for the filled (managed) dot. */
  dot: string;
  /** Tailwind border class for the hollow (observed) ring. Literal so Tailwind's scanner emits it. */
  ring: string;
  /** Tailwind text class for the label. */
  text: string;
}

/** Per-state display metadata. Working = teal, Waiting = amber, Idle = slate, Ended = faint. */
export const STATE_META: Record<SessionState, StateMeta> = {
  working: {
    label: "Working",
    dot: "bg-working",
    ring: "border-working",
    text: "text-working-bright",
  },
  waiting: {
    label: "Waiting",
    dot: "bg-accent",
    ring: "border-accent",
    text: "text-accent-bright",
  },
  idle: {
    label: "Idle",
    dot: "bg-idle",
    ring: "border-idle",
    text: "text-fg-muted",
  },
  ended: {
    label: "Ended",
    dot: "bg-ink-600",
    ring: "border-ink-600",
    text: "text-fg-faint",
  },
};

/** The display name for each family. The exact version, when known, is appended by `modelLabel`. */
export const FAMILY_LABEL: Record<Family, string> = {
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
  fable: "Fable",
};

/** Below this %, the context gauge is noise; at or above it the sidebar row surfaces the number and
 *  ctxTone warms it to amber. One constant so the "show it" gate and the color never disagree. */
export const CONTEXT_WARN_PCT = 70;
/** At or above this %, the context gauge redlines: bright amber fill and a danger tick. */
export const CONTEXT_DANGER_PCT = 85;

/** Tailwind text tone for a context %: muted when roomy, amber and brightening as it fills. */
export function ctxTone(pct: number): string {
  if (pct >= CONTEXT_DANGER_PCT) return "text-accent-bright";
  if (pct >= CONTEXT_WARN_PCT) return "text-accent";
  return "text-fg-muted";
}

/** The context % earns a spot in a sidebar row only once it crosses the warning threshold. */
export function isContextHigh(pct: number): boolean {
  return pct >= CONTEXT_WARN_PCT;
}

/** Tailwind fill for a progress bar: neutral steel when roomy (telemetry reads as data, not an
 *  affordance — sky is reserved for interaction), amber as it fills, bright at/over `high`. The bar-shaped
 *  twin of `ctxColor`; both go steel→amber on the same breakpoints so the ring and the bars never drift. */
export function barFill(pct: number, high = 85): string {
  if (pct >= high) return "bg-accent";
  if (pct >= 70) return "bg-accent/80";
  return "bg-steel/70";
}

/**
 * The context ring's fill color as a CSS var: neutral steel while roomy (telemetry reads as data, not an
 * affordance — sky is reserved for interaction), amber from 70%, bright amber from 85% — the same 70/85
 * breakpoints as `ctxTone`, so the ring's color and the % text inside it never disagree on "how full".
 */
export function ctxColor(pct: number): string {
  if (pct >= CONTEXT_DANGER_PCT) return "var(--color-accent-bright)";
  if (pct >= CONTEXT_WARN_PCT) return "var(--color-accent)";
  return "var(--color-steel)";
}

/**
 * The cost/token breakdown palette: a monochrome magnitude ramp (Instrument discipline — charts read as
 * data, never affordances, so hue is reserved for live state). Light → deep by token kind, with a dimmest
 * tail for cache-write. Used by the cost donut + legend and the token stacked bar + legend, so each diagram
 * and its legend always agree. CSS var strings so a retone stays in index.css.
 */
export const COST_SEGMENT_COLORS = [
  "var(--color-data-1)", // Input — lightest
  "var(--color-data-2)", // Output
  "var(--color-data-3)", // Cache read
  "var(--color-data-4)", // Cache write — dimmest
] as const;

/** The Overview's kind palette: input and output carry color (the fresh-token split is the meaningful
 *  part of a usage chart), cache greys back. Deliberately distinct from COST_SEGMENT_COLORS — the cockpit's
 *  all-mono ramp — so the cockpit token panel stays monochrome while the analytics view reads in color. */
export const OVERVIEW_KIND_COLORS = [
  "var(--color-primary)", // Input — blue
  "var(--color-violet)", // Output — violet
  "var(--color-data-3)", // Cache read — grey
  "var(--color-data-4)", // Cache write — grey
] as const;

export const TOKEN_SEGMENT_COLORS = [
  "var(--color-data-1)", // Input
  "var(--color-data-2)", // Output
  "var(--color-data-3)", // Cached
] as const;

/** Model identity colors (Aurora): one fixed hue per known family, looked up BY family — not cycled by row
 *  index — so a model reads the same color everywhere it appears (By model, daily stack-by-model, By
 *  session). Chosen off the danger/waiting/working state hues so a swatch never reads as a state lamp; the
 *  tokens live in index.css. */
export const MODEL_FAMILY_COLORS: Record<Family, string> = {
  fable: "var(--color-model-fable)",
  opus: "var(--color-model-opus)",
  sonnet: "var(--color-model-sonnet)",
  haiku: "var(--color-model-haiku)",
};

/** Any model the breakdown can't place — null, or a raw string matching no known family — stays
 *  white/mono, so identity color is reserved for the recognized families. */
export const MODEL_OTHER_COLOR = "var(--color-data-1)";

/** The identity color for a raw model id: its family's fixed hue when recognized, else the neutral
 *  "other" tone. Drives the By-model bars, the daily stack-by-model, and the By-session model swatch. */
export function modelColorOf(raw: string | null): string {
  return raw && isKnownModelString(raw)
    ? MODEL_FAMILY_COLORS[normalizeModelId(raw)]
    : MODEL_OTHER_COLOR;
}

/** The contributions calendar's intensity ramp (#115), indexed by intensityLevel's 0..4 output: level 0 is
 *  the empty-day track; 1–4 climb an engaged-blue heat (faint → full via color-mix opacity). The Overview's
 *  one spot of accent — activity-over-time gets the single splash of color. Tokens stay in index.css. */
export const CALENDAR_RAMP = [
  "var(--color-ink-850)", // 0 — no activity
  "color-mix(in srgb, var(--color-primary) 28%, transparent)", // 1
  "color-mix(in srgb, var(--color-primary) 52%, transparent)", // 2
  "color-mix(in srgb, var(--color-primary) 76%, transparent)", // 3
  "var(--color-primary)", // 4 — peak
] as const;

/** A session's model label: the family name, plus the real resolved id in parens when we have one.
 *  `raw` is the live statusLine modelId else the persisted transcript modelRaw. A raw that matches no
 *  known family shows the capture's display_name (or the raw) rather than a faked family. `compact`
 *  drops the parens for dense rows. With no raw at all, `known: false` yields "Unknown" (the family is
 *  only the normalize fallback); the default trusts the family. */
export function modelLabel(
  family: Family,
  raw: string | undefined,
  displayName: string | undefined,
  opts?: { compact?: boolean; known?: boolean },
): string {
  if (raw && !isKnownModelString(raw)) return displayName || raw;
  // No real model string was ever recorded. Trust the family only when the caller vouches for it (a
  // Managed session ran the picked alias). Otherwise the family is just the normalize fallback, so say
  // "Unknown" rather than guessing — e.g. an Ended session that errored before any real turn.
  if (!raw && opts?.known === false) return "Unknown";
  const label = FAMILY_LABEL[family];
  if (opts?.compact || !raw) return label;
  return `${label} (${raw})`;
}
