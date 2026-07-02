import {
  HEADER_EDGE_PADDING_PX,
  HEADER_HEIGHT_PX,
  MAC_TRAFFIC_LIGHT_POSITION,
} from "@shared/chrome";

/**
 * Geometry for the fixed titlebar toggle clusters (ported from hermes-agent's titlebar.ts). The
 * clusters are `position: fixed` siblings of the pane grid: the left one toggles the left pane and
 * sits just past the macOS traffic lights (or at the bare edge inset elsewhere/fullscreen); the
 * right one toggles the right pane and pins to the window's right edge. Pure (no DOM) so the
 * inset math is unit-testable under the node tsconfig.
 */

/** Hit-target of one cluster button (CSS px) — hermes: 20 wide x 22 tall. */
export const TITLEBAR_CONTROL_WIDTH = 20;
export const TITLEBAR_CONTROL_HEIGHT = 22;

/** Edge inset (CSS px) when no native controls occupy that corner — the right side always, the
 *  left side off macOS or in macOS fullscreen. Matches hermes's TITLEBAR_EDGE_INSET. */
export const TITLEBAR_EDGE_INSET = 14;

/** How far past the traffic lights' LEFT EDGE the cluster starts (hermes's
 *  TITLEBAR_CONTROL_OFFSET_X): cluster left = lights.x + this, NOT an absolute inset —
 *  hermes titlebarControlsPosition adds it to windowButtonPosition.x. */
export const TITLEBAR_CONTROL_OFFSET_X = 74;

/** Top offset that vertically centers a control in the titlebar band. */
export const TITLEBAR_CONTROLS_TOP =
  (HEADER_HEIGHT_PX - TITLEBAR_CONTROL_HEIGHT) / 2;

/** Where the left cluster's left edge sits: past the traffic lights on mac windowed, else at the
 *  bare edge inset (fullscreen hides the lights; other platforms never have them). */
export function titlebarControlsLeftPx(
  isMac: boolean,
  isFullscreen: boolean,
): number {
  return isMac && !isFullscreen
    ? MAC_TRAFFIC_LIGHT_POSITION.x + TITLEBAR_CONTROL_OFFSET_X
    : TITLEBAR_EDGE_INSET;
}

/** The middle header's left padding when the left pane is NOT docked beside it (closed or
 *  force-collapsed): clear the traffic lights and the left cluster. Hermes's formula:
 *  controls.left + control width + half a control of breathing room. Deliberately NOT animated —
 *  it snaps in the same frame as the pane's grid track. */
export function titlebarContentInsetPx(
  isMac: boolean,
  isFullscreen: boolean,
): number {
  return (
    titlebarControlsLeftPx(isMac, isFullscreen) +
    TITLEBAR_CONTROL_WIDTH +
    Math.round(TITLEBAR_CONTROL_WIDTH / 2)
  );
}

/** The middle header's right padding: clear the right cluster while it floats over the header
 *  (session present AND the right pane not docked), else the plain edge padding. */
export function headerRightPaddingPx(rightClusterOverHeader: boolean): number {
  return rightClusterOverHeader
    ? TITLEBAR_EDGE_INSET + TITLEBAR_CONTROL_WIDTH + 8
    : HEADER_EDGE_PADDING_PX;
}
