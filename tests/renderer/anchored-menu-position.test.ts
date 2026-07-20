import { describe, expect, it } from "vitest";
import { placeAnchoredMenu } from "../../src/renderer/src/shell/anchored-menu-position";

describe("placeAnchoredMenu", () => {
  it("right-aligns below the trigger when the menu fits", () => {
    expect(
      placeAnchoredMenu(
        { left: 280, right: 300, top: 20, bottom: 40 },
        { width: 400, height: 500 },
        { width: 192, height: 220 },
        "end",
      ),
    ).toEqual({ left: 108, top: 46 });
  });

  it("clamps horizontal placement to the viewport gutter", () => {
    expect(
      placeAnchoredMenu(
        { left: 2, right: 22, top: 20, bottom: 40 },
        { width: 400, height: 500 },
        { width: 192, height: 220 },
        "end",
      ).left,
    ).toBe(8);
  });

  it("flips above when the menu would clip below", () => {
    expect(
      placeAnchoredMenu(
        { left: 280, right: 300, top: 300, bottom: 320 },
        { width: 400, height: 340 },
        { width: 192, height: 220 },
        "end",
      ).top,
    ).toBe(74);
  });

  it("clamps to the viewport gutter when neither side fits", () => {
    expect(
      placeAnchoredMenu(
        { left: 100, right: 120, top: 70, bottom: 90 },
        { width: 300, height: 150 },
        { width: 192, height: 134 },
        "end",
      ).top,
    ).toBe(8);
  });
});
