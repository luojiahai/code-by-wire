import { describe, it, expect } from "vitest";
import { viewportScrollTop } from "../../src/renderer/src/xterm/viewport-scroll";

// 524 buffer lines, 24 visible rows of 17px → 8908px scroll area, 408px viewport. These identities only
// hold because xterm's scroll-area height is `length * rowHeight`, which is exactly what we lean on.
const ROW = 17;
const ROWS = 24;
const LENGTH = 524;
const SCROLL_HEIGHT = LENGTH * ROW; // 8908
const CLIENT_HEIGHT = ROWS * ROW; // 408

describe("viewportScrollTop — realign the DOM scroll with xterm's viewportY after a tab-switch re-attach", () => {
  it("at the bottom resolves to the max scroll, not 0 (the reported jump-to-top)", () => {
    const baseY = LENGTH - ROWS; // 500: fully scrolled down
    const top = viewportScrollTop(baseY, LENGTH, SCROLL_HEIGHT);
    expect(top).toBe(baseY * ROW); // 8500 — exactly where the renderer draws
    expect(top).toBe(SCROLL_HEIGHT - CLIENT_HEIGHT); // == the maximum scrollTop the browser allows
  });

  it("preserves a scrolled-up position proportionally", () => {
    expect(viewportScrollTop(100, LENGTH, SCROLL_HEIGHT)).toBe(100 * ROW);
  });

  it("is 0 at the top and for an empty buffer", () => {
    expect(viewportScrollTop(0, LENGTH, SCROLL_HEIGHT)).toBe(0);
    expect(viewportScrollTop(0, 0, 0)).toBe(0);
  });
});
