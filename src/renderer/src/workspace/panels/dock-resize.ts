/**
 * Height clamps for the Activity dock's vertical resize. The dock persists its height through the
 * shared pane store (shell/panes.ts, id "activity-dock"); this module owns the pure clamp so it stays
 * JSX-free and unit-testable under the node tsconfig.
 */

/** Default expanded height (px) — the dock's original fixed h-64. */
export const DOCK_DEFAULT_HEIGHT = 256;
/** Floor (px): keep the header bar plus a couple of rows visible. */
export const DOCK_MIN_HEIGHT = 140;
/** Ceiling as a fraction of the viewport, so the center view above always survives. */
export const DOCK_MAX_VH = 0.6;

/** Clamp a proposed dock height (px) to [DOCK_MIN_HEIGHT, DOCK_MAX_VH * viewportPx], rounded to an int. */
export function clampDockHeight(nextPx: number, viewportPx: number): number {
  const max = Math.max(DOCK_MIN_HEIGHT, viewportPx * DOCK_MAX_VH);
  return Math.round(Math.min(max, Math.max(DOCK_MIN_HEIGHT, nextPx)));
}
