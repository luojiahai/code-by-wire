/** Ported from microsoft/vscode (MIT) — src/vs/workbench/contrib/terminal/browser/
 *  terminalConfigurationService.ts (TerminalFontMetrics) and xterm/xtermTerminal.ts
 *  (getXtermScaledDimensions) — adapted for code-by-wire. VS Code sizes its terminal
 *  with this math instead of @xterm/addon-fit; so do we (spec §6). */

export interface TerminalFont {
  fontFamily: string;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  charWidth?: number;
  charHeight?: number;
}

let charMeasureElement: HTMLElement | undefined;
let lastMeasurement: { charWidth: number; charHeight: number } | undefined;

/** Hidden-div DOM probe of a single 'X' (vscode _getBoundingRectFor). The element is created
 *  once and reused; display toggles around the read so it never affects layout. */
function boundingRectFor(
  w: Window,
  fontFamily: string,
  fontSize: number,
): DOMRect {
  if (!charMeasureElement || !charMeasureElement.isConnected) {
    charMeasureElement = w.document.createElement("div");
    charMeasureElement.style.display = "none";
    w.document.body.appendChild(charMeasureElement);
  }
  const style = charMeasureElement.style;
  style.display = "inline-block";
  style.fontFamily = fontFamily;
  style.fontSize = `${fontSize}px`;
  style.lineHeight = "normal";
  charMeasureElement.innerText = "X";
  const rect = charMeasureElement.getBoundingClientRect();
  style.display = "none";
  return rect;
}

/** Measure the char cell. An invalid rect (element not laid out yet) returns the last good
 *  measurement — undefined if there has never been one, in which case the caller skips this
 *  layout pass and the ResizeObserver naturally retries (vscode :227-229). charWidth takes the
 *  device-pixel round-trip so it matches xterm's renderer cell math (vscode :247-250). */
export function measureFont(
  w: Window,
  fontFamily: string,
  fontSize: number,
  letterSpacing: number,
): { charWidth: number; charHeight: number } | undefined {
  const rect = boundingRectFor(w, fontFamily, fontSize);
  if (!rect.width || !rect.height) return lastMeasurement;
  const charHeight = Math.ceil(rect.height);
  const deviceCharWidth = Math.floor(rect.width * w.devicePixelRatio);
  const deviceCellWidth = deviceCharWidth + Math.round(letterSpacing);
  const cssCellWidth = deviceCellWidth / w.devicePixelRatio;
  const charWidth =
    cssCellWidth - Math.round(letterSpacing) / w.devicePixelRatio;
  lastMeasurement = { charWidth, charHeight };
  return lastMeasurement;
}

/** cols/rows from available CSS pixels — the exact vscode formula (xtermTerminal.ts:1130-1150):
 *  scale everything to device pixels, floor-divide by the scaled cell, clamp to 1. */
export function getXtermScaledDimensions(
  w: Window,
  font: TerminalFont,
  width: number,
  height: number,
): { cols: number; rows: number } | null {
  if (!font.charWidth || !font.charHeight) return null;
  const scaledWidthAvailable = width * w.devicePixelRatio;
  const scaledCharWidth =
    font.charWidth * w.devicePixelRatio + font.letterSpacing;
  const cols = Math.max(Math.floor(scaledWidthAvailable / scaledCharWidth), 1);
  const scaledHeightAvailable = height * w.devicePixelRatio;
  const scaledCharHeight = Math.ceil(font.charHeight * w.devicePixelRatio);
  const scaledLineHeight = Math.floor(scaledCharHeight * font.lineHeight);
  const rows = Math.max(
    Math.floor(scaledHeightAvailable / scaledLineHeight),
    1,
  );
  return { cols, rows };
}

/** The one "should we resize, and to what" computation both terminal consumers call
 *  (spec §6 pipeline steps 1, 3-5): bail on a non-positive size, subtract the element's
 *  own padding only (never a scrollbar allowance — spec §7 deviation 6), compute the
 *  scaled grid, and return null when it matches the current size (so callers skip the
 *  debounced resize entirely). Consumers keep their own guard conditions (disposed,
 *  connected) and the debouncer call — only this math is shared. */
export function computeLayoutResize(
  w: Window,
  el: HTMLElement | undefined,
  font: TerminalFont,
  width: number,
  height: number,
  currentCols: number,
  currentRows: number,
): { cols: number; rows: number } | null {
  if (width <= 0 || height <= 0) return null;
  let availW = width;
  let availH = height;
  if (el) {
    const cs = getComputedStyle(el);
    availW -= parseInt(cs.paddingLeft) + parseInt(cs.paddingRight);
    availH -= parseInt(cs.paddingTop) + parseInt(cs.paddingBottom);
  }
  const dims = getXtermScaledDimensions(w, font, availW, availH);
  if (!dims) return null;
  if (dims.cols === currentCols && dims.rows === currentRows) return null;
  return dims;
}
