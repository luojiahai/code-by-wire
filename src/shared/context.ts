import type { ContextBreakdown } from "./transcript";

/** Total tokens in the current context — the latest turn's full prompt. */
export function contextTotal(b: ContextBreakdown): number {
  return b.cacheRead + b.cacheCreation + b.input;
}

/** The context panel's resolved view: its token total and the fill %. */
export interface ContextView {
  total: number;
  /** Fill %, 0 to 100. The capture's used_percentage when live, else tokens-over-window. */
  pct: number;
}

/**
 * Resolve the context panel's view. Prefer the live statusLine capture: its current_usage total, and the
 * fill % straight from Claude's used_percentage (so it matches the Overview's % for the Session). With no
 * live capture, fall back to the transcript-derived total and a tokens-over-window %. Returns null only
 * when neither source has any context, which is the panel's empty state.
 */
export function contextView(opts: {
  live: ContextBreakdown | null | undefined;
  fallback: ContextBreakdown | null | undefined;
  capturedPct: number | null | undefined;
  window: number;
}): ContextView | null {
  const pctOfWindow = (total: number): number =>
    opts.window > 0
      ? Math.min(100, Math.round((total / opts.window) * 100))
      : 0;
  if (opts.live) {
    const total = contextTotal(opts.live);
    const pct =
      opts.capturedPct != null
        ? Math.min(100, Math.max(0, Math.round(opts.capturedPct)))
        : pctOfWindow(total);
    return { total, pct };
  }
  if (opts.fallback) {
    const total = contextTotal(opts.fallback);
    return { total, pct: pctOfWindow(total) };
  }
  return null;
}
