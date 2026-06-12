import type { ModelId, SessionState } from "@shared/types";
import { isKnownModelString } from "@shared/models";

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

export const MODEL_LABEL: Record<ModelId, string> = {
  "claude-opus-4-8": "Opus 4.8",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5": "Haiku 4.5",
};

/** Compact model label for the dense table's Model column. */
export const MODEL_SHORT: Record<ModelId, string> = {
  "claude-opus-4-8": "Opus",
  "claude-sonnet-4-6": "Sonnet",
  "claude-haiku-4-5": "Haiku",
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

/** The display label for a Session's model. A recognized model (its statusLine model.id matches a known
 *  family) shows the app's clean label from `table`; a model absent from the table shows the capture's
 *  real display_name — or its raw id when the capture omitted the name — so it never masquerades as the
 *  Opus fallback. With no capture, the clean label stands; pricing and window keep riding the normalized
 *  `model` regardless. */
export function honestModelLabel(
  model: ModelId,
  captureModelId: string | undefined,
  captureDisplayName: string | undefined,
  table: Record<ModelId, string>,
): string {
  if (captureModelId && !isKnownModelString(captureModelId))
    return captureDisplayName || captureModelId;
  return table[model];
}
