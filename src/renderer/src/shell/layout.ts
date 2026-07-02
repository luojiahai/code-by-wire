import { ensurePaneRegistered } from "./panes";

export const CBW_LEFT_PANE_ID = "cbw-left";
export const CBW_RIGHT_PANE_ID = "cbw-right";

export const LEFT_DEFAULT_WIDTH = 237;
export const LEFT_MIN_WIDTH = 237;
export const LEFT_MAX_WIDTH = 360;
export const RIGHT_DEFAULT_WIDTH = 237; // hermes FILE_BROWSER_DEFAULT_WIDTH (= sidebar width)
export const RIGHT_MIN_WIDTH = 160; // hermes FILE_BROWSER_MIN_WIDTH (10rem)
export const RIGHT_MAX_WIDTH = 320; // hermes FILE_BROWSER_MAX_WIDTH (20rem)

ensurePaneRegistered(CBW_LEFT_PANE_ID, { open: true });
ensurePaneRegistered(CBW_RIGHT_PANE_ID, { open: true });
