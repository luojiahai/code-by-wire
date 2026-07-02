import { describe, expect, it } from "vitest";
import {
  TITLEBAR_CONTROL_WIDTH,
  TITLEBAR_CONTROL_HEIGHT,
  TITLEBAR_CONTROLS_TOP,
  TITLEBAR_EDGE_INSET,
  titlebarControlsLeftPx,
  titlebarContentInsetPx,
  headerRightPaddingPx,
} from "../../src/renderer/src/shell/titlebar";

describe("titlebar cluster geometry (hermes constants)", () => {
  it("centers the 20x22 controls in the 34px band", () => {
    expect(TITLEBAR_CONTROL_WIDTH).toBe(20);
    expect(TITLEBAR_CONTROL_HEIGHT).toBe(22);
    expect(TITLEBAR_CONTROLS_TOP).toBe(6); // (34 - 22) / 2
  });

  it("puts the left cluster after the traffic lights on mac windowed, at the edge otherwise", () => {
    // hermes: windowButtonPosition.x (24) + TITLEBAR_CONTROL_OFFSET_X (74) — the 74 is an
    // offset PAST the lights, not an absolute inset (hermes titlebar.ts:45, main.cjs:408).
    expect(titlebarControlsLeftPx(true, false)).toBe(24 + 74); // 98
    expect(titlebarControlsLeftPx(true, true)).toBe(TITLEBAR_EDGE_INSET); // 14
    expect(titlebarControlsLeftPx(false, false)).toBe(TITLEBAR_EDGE_INSET);
    expect(titlebarControlsLeftPx(false, true)).toBe(TITLEBAR_EDGE_INSET);
  });

  it("insets the header past the lights AND the left cluster when the edge is exposed", () => {
    // hermes formula: controls.left + control width + round(width / 2)
    expect(titlebarContentInsetPx(true, false)).toBe(98 + 20 + 10); // 128
    expect(titlebarContentInsetPx(true, true)).toBe(14 + 20 + 10); // 44
    expect(titlebarContentInsetPx(false, false)).toBe(44);
  });

  it("reserves room for the right cluster only when it floats over the header", () => {
    expect(headerRightPaddingPx(true)).toBe(14 + 20 + 8); // 42
    expect(headerRightPaddingPx(false)).toBe(12); // HEADER_EDGE_PADDING_PX (hermes 0.75rem)
  });
});
