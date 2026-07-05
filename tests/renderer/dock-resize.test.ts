import { describe, expect, it } from "vitest";
import {
  DOCK_MIN_HEIGHT,
  clampDockHeight,
} from "../../src/renderer/src/workspace/panels/dock-resize";

describe("clampDockHeight", () => {
  const viewport = 1000; // ceiling = 0.6 * 1000 = 600

  it("returns the value unchanged inside the range", () => {
    expect(clampDockHeight(300, viewport)).toBe(300);
  });

  it("floors at DOCK_MIN_HEIGHT", () => {
    expect(clampDockHeight(50, viewport)).toBe(DOCK_MIN_HEIGHT);
  });

  it("caps at DOCK_MAX_VH of the viewport", () => {
    expect(clampDockHeight(5000, viewport)).toBe(600);
  });

  it("rounds to an integer", () => {
    expect(clampDockHeight(300.7, viewport)).toBe(301);
  });

  it("prefers the floor when the viewport is tiny", () => {
    // 0.6 * 100 = 60 < min, so the ceiling collapses to the floor.
    expect(clampDockHeight(300, 100)).toBe(DOCK_MIN_HEIGHT);
  });
});
