/**
 * Window-chrome constants shared by the main process (native window sizing + sheet offset) and the
 * renderer (the title bar's height and its macOS traffic-light inset). Co-located so the two layers
 * can't drift: the header height in particular is consumed by main's setSheetOffset AND the renderer's
 * header, and a past change had to edit both in lockstep by hand.
 */

/** The title bar's height in CSS px. Main offsets native sheets (the directory picker) by this so they
 *  drop below the bar; the renderer applies it as the header height. Must stay in lockstep with --titlebar-height in src/renderer/src/index.css. */
export const HEADER_HEIGHT_PX = 34;

/** Where main parks the macOS traffic lights, in DIP. Hermes's WINDOW_BUTTON_POSITION verbatim
 *  (main.cjs): x 24, y = (34px band − 14px lights) / 2. The renderer derives the left cluster's
 *  inset from this (position.x + TITLEBAR_CONTROL_OFFSET_X in shell/titlebar.ts). */
export const MAC_TRAFFIC_LIGHT_POSITION: { x: number; y: number } = {
  x: 24,
  y: 10,
};

/** The header's edge padding (CSS px) where there are no traffic lights to clear: the right side always,
 *  the left side off macOS or in macOS fullscreen. The wordmark drops to this and slides into the corner
 *  when the lights vacate it. */
export const HEADER_EDGE_PADDING_PX = 12;
