import { describe, it, expect, afterEach, vi } from "vitest";
import {
  measureFont,
  getXtermScaledDimensions,
  computeLayoutResize,
  type TerminalFont,
} from "../../src/renderer/src/xterm/terminal-font-metrics";

const win = (dpr: number): Window =>
  Object.assign(Object.create(window), { devicePixelRatio: dpr }) as Window;

function font(partial: Partial<TerminalFont>): TerminalFont {
  return {
    fontFamily: "monospace",
    fontSize: 11,
    letterSpacing: 0,
    lineHeight: 1,
    ...partial,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("getXtermScaledDimensions (vscode xtermTerminal.ts:1130-1150 math)", () => {
  it("divides available pixels by the scaled cell size, flooring", () => {
    const f = font({ charWidth: 7, charHeight: 14 });
    expect(getXtermScaledDimensions(win(1), f, 700, 280)).toEqual({
      cols: 100,
      rows: 20,
    });
  });

  it("lineHeight scales the row height (floored)", () => {
    const f = font({ charWidth: 7, charHeight: 14, lineHeight: 1.12 });
    // scaledLineHeight = floor(ceil(14) * 1.12) = 15 -> rows = floor(280/15) = 18
    expect(getXtermScaledDimensions(win(1), f, 700, 280)).toEqual({
      cols: 100,
      rows: 18,
    });
  });

  it("is devicePixelRatio-invariant for integer cells", () => {
    const f = font({ charWidth: 7, charHeight: 14 });
    expect(getXtermScaledDimensions(win(2), f, 700, 280)).toEqual({
      cols: 100,
      rows: 20,
    });
  });

  it("letterSpacing joins the scaled char width", () => {
    const f = font({ charWidth: 7, charHeight: 14, letterSpacing: 1 });
    // scaledCharWidth = 7*1 + 1 = 8 -> cols = floor(700/8) = 87
    expect(getXtermScaledDimensions(win(1), f, 700, 280)!.cols).toBe(87);
  });

  it("clamps to at least 1x1", () => {
    const f = font({ charWidth: 7, charHeight: 14 });
    expect(getXtermScaledDimensions(win(1), f, 3, 3)).toEqual({
      cols: 1,
      rows: 1,
    });
  });

  it("returns null when char dims are unknown", () => {
    expect(getXtermScaledDimensions(win(1), font({}), 700, 280)).toBeNull();
  });
});

describe("measureFont (vscode terminalConfigurationService.ts:204-255 probe)", () => {
  it("returns undefined for an invalid rect with no prior measurement", () => {
    // jsdom rects are 0x0 by default — exactly the invalid-rect path.
    expect(measureFont(win(1), "monospace", 11, 0)).toBeUndefined();
  });

  it("derives charWidth via the device-pixel round-trip and caches the result", () => {
    const spy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 7.2, height: 13.4 } as DOMRect);
    // dpr 1: deviceCharWidth = floor(7.2) = 7; cell = 7 + 0; charWidth = 7
    expect(measureFont(win(1), "monospace", 11, 0)).toEqual({
      charWidth: 7,
      charHeight: 14, // ceil(13.4)
    });
    spy.mockRestore();
    // Invalid rect now falls back to the cached measurement (vscode :227-229).
    expect(measureFont(win(1), "monospace", 11, 0)).toEqual({
      charWidth: 7,
      charHeight: 14,
    });
  });

  it("rounds letterSpacing through the device-pixel cell like xterm's renderer", () => {
    const spy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 7.2, height: 13.4 } as DOMRect);
    // dpr 2: device = floor(14.4) = 14; cell = 14 + 1; css = 7.5; charWidth = 7.5 - 0.5 = 7
    expect(measureFont(win(2), "monospace", 11, 1)).toEqual({
      charWidth: 7,
      charHeight: 14,
    });
    spy.mockRestore();
  });
});

describe("computeLayoutResize (shared consumer-facing layout math)", () => {
  const f = font({ charWidth: 7, charHeight: 14 });

  it("bails on a non-positive size", () => {
    expect(computeLayoutResize(win(1), undefined, f, 0, 280, 0, 0)).toBeNull();
    expect(computeLayoutResize(win(1), undefined, f, 700, 0, 0, 0)).toBeNull();
  });

  it("subtracts only the element's own padding — no scrollbar allowance", () => {
    const el = document.createElement("div");
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      paddingLeft: "8px",
      paddingRight: "8px",
      paddingTop: "8px",
      paddingBottom: "8px",
    } as CSSStyleDeclaration);
    // available = 700-16=684, 280-16=264 -> cols=floor(684/7)=97, rows=floor(264/14)=18
    expect(computeLayoutResize(win(1), el, f, 700, 280, 0, 0)).toEqual({
      cols: 97,
      rows: 18,
    });
    vi.restoreAllMocks();
  });

  it("returns null when the computed grid matches the current size", () => {
    expect(computeLayoutResize(win(1), undefined, f, 700, 280, 100, 20)).toBeNull();
  });

  it("returns the new grid when it differs from the current size", () => {
    expect(computeLayoutResize(win(1), undefined, f, 700, 280, 99, 20)).toEqual({
      cols: 100,
      rows: 20,
    });
  });
});
