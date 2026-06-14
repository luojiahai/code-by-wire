import type { SessionState } from "@shared/types";
import { isKnownModelString, type Family } from "@shared/models";

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

/** Tailwind text tone for a context %: muted when roomy, amber and brightening as it fills. */
export function ctxTone(pct: number): string {
  if (pct >= 85) return "text-accent-bright";
  if (pct >= CONTEXT_WARN_PCT) return "text-accent";
  return "text-fg-muted";
}

/** The context % earns a spot in a sidebar row only once it crosses the warning threshold. */
export function isContextHigh(pct: number): boolean {
  return pct >= CONTEXT_WARN_PCT;
}

/** Tailwind fill for a progress bar: sky (wire) when roomy, amber as it fills, bright at/over `high`.
 *  Shared by the context bars (high 85) and the rate-limit bars (high 90) so the two never drift. */
export function barFill(pct: number, high = 85): string {
  if (pct >= high) return "bg-accent";
  if (pct >= 70) return "bg-accent/80";
  return "bg-primary/70";
}

/**
 * The context ring's fill color as a CSS var: sky (wire) while roomy, amber from 70%, bright amber from
 * 85% — the same 70/85 breakpoints as `ctxTone`, so the ring's color and the % text inside it never
 * disagree on "how full".
 */
export function ctxColor(pct: number): string {
  if (pct >= 85) return "var(--color-accent-bright)";
  if (pct >= 70) return "var(--color-accent)";
  return "var(--color-primary)";
}

/**
 * Semantic composition palette: blue = fresh spend/work, green = cache. Used by the cost donut + legend
 * and the token stacked bar + legend, so the diagram and its legend always agree. CSS var strings (and
 * one color-mix for the dim cache-write) so a retone stays in index.css.
 */
export const COST_SEGMENT_COLORS = [
  "var(--color-primary)", // Input — fresh
  "var(--color-primary-bright)", // Output — fresh
  "var(--color-ok)", // Cache read
  "color-mix(in srgb, var(--color-ok) 55%, transparent)", // Cache write — dim
] as const;

export const TOKEN_SEGMENT_COLORS = [
  "var(--color-primary)", // Input
  "var(--color-primary-bright)", // Output
  "var(--color-ok)", // Cached
] as const;

/** The per-model breakdown's donut + legend palette (#111), cycled by row index. Distinct hues so adjacent
 *  models read apart; CSS var strings so a retone stays in index.css. More models than colors wraps — fine
 *  for a legend read top-down against its donut. */
export const MODEL_SEGMENT_COLORS = [
  "var(--color-primary)",
  "var(--color-working)",
  "var(--color-accent)",
  "var(--color-ok)",
  "var(--color-primary-bright)",
  "var(--color-danger)",
] as const;

/** The contributions calendar's intensity ramp (#115), indexed by intensityLevel's 0..4 output: level 0 is
 *  the empty-day track, 1–4 ramp the wire brand color --color-primary from faint to full via color-mix
 *  opacity — on-brand for code-by-wire and matching the daily chart's fresh-spend hue. CSS var / color-mix
 *  strings so a retone stays in index.css. */
export const CALENDAR_RAMP = [
  "var(--color-ink-850)", // 0 — no activity
  "color-mix(in srgb, var(--color-primary) 30%, transparent)", // 1
  "color-mix(in srgb, var(--color-primary) 55%, transparent)", // 2
  "color-mix(in srgb, var(--color-primary) 78%, transparent)", // 3
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
