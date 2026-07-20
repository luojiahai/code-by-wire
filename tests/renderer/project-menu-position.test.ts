import { describe, expect, it } from "vitest";
import { placeProjectMenu } from "../../src/renderer/src/shell/project-menu-position";

describe("placeProjectMenu", () => {
  it("anchors the menu's left edge at the trigger and clamps to the viewport", () => {
    expect(
      placeProjectMenu(
        { left: 40, top: 20, bottom: 40 },
        { width: 400, height: 500 },
        200,
      ),
    ).toEqual({
      left: 40,
      top: 46,
    });
    expect(
      placeProjectMenu(
        { left: 280, top: 20, bottom: 40 },
        { width: 300, height: 500 },
        200,
      ).left,
    ).toBe(36);
  });

  it("flips above the trigger when the menu would clip below", () => {
    expect(
      placeProjectMenu(
        { left: 40, top: 180, bottom: 200 },
        { width: 400, height: 220 },
        100,
      ),
    ).toEqual({
      left: 40,
      top: 74,
    });
  });

  it("clamps vertically when neither side fully fits", () => {
    expect(
      placeProjectMenu(
        { left: 40, top: 70, bottom: 90 },
        { width: 300, height: 150 },
        190,
      ).top,
    ).toBe(8);
  });
});
