/**
 * Window-chrome constants shared by the main process (native window sizing + sheet offset) and the
 * renderer (the title bar's height and its macOS traffic-light inset). Co-located so the two layers
 * can't drift: the header height in particular is consumed by main's setSheetOffset AND the renderer's
 * header, and a past change had to edit both in lockstep by hand.
 */

/** The title bar's height in CSS px. Main offsets native sheets (the directory picker) by this so they
 *  drop below the bar; the renderer applies it as the header height. Change here, both follow. */
export const HEADER_HEIGHT_PX = 40;

/** Left inset (CSS px) the renderer reserves on macOS so the wordmark clears the native traffic lights.
 *  Must stay wider than the lights' right edge (see MAC_TRAFFIC_LIGHT_POSITION). */
export const MAC_TRAFFIC_LIGHT_INSET_PX = 96;

/** Where main parks the macOS traffic lights, in DIP. Kept beside the inset above so the two stay
 *  visually consistent: x must sit within MAC_TRAFFIC_LIGHT_INSET_PX, y centers the lights in the bar. */
export const MAC_TRAFFIC_LIGHT_POSITION: { x: number; y: number } = {
  x: 16,
  y: 14,
};

/** The header's edge padding (CSS px) where there are no traffic lights to clear: the right side always,
 *  the left side off macOS or in macOS fullscreen. The wordmark drops to this and slides into the corner
 *  when the lights vacate it. */
export const HEADER_EDGE_PADDING_PX = 16;

/** The wordmark's left inset (CSS px). It clears the macOS traffic lights only when windowed; in
 *  fullscreen the lights are gone, so it falls back to the plain edge padding. Off macOS there are never
 *  lights. Pure (no DOM) so the header's one piece of branching logic can be unit-tested. */
export function headerLeftPaddingPx(
  isMac: boolean,
  isFullscreen: boolean,
): number {
  return isMac && !isFullscreen
    ? MAC_TRAFFIC_LIGHT_INSET_PX
    : HEADER_EDGE_PADDING_PX;
}
