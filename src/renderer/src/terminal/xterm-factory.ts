import type { XtermLike } from "./terminal-store";
import { XtermTerminal } from "../xterm/xterm-terminal";
import { terminalTheme } from "../xterm/terminal-theme";
import { TerminalResizeDebouncer } from "../xterm/terminal-resize-debouncer";
import { computeLayoutResize } from "../xterm/terminal-font-metrics";

/** xterm options tuned for the Claude TUI: generous scrollback, a monospace stack, and a
 *  steady cursor. convertEol stays off — the TUI emits its own. customGlyphs +
 *  rescaleOverlappingGlyphs only take effect under a GPU renderer — they draw block/box
 *  art as vector shapes (the Claude Code mascot fix). minimumContrastRatio 4.5 and
 *  unicode 11 are the VS Code defaults, converged across both terminals (spec §8.11-12).
 *  `theme` is set by XtermTerminal (mode-aware), not here. */
const OPTIONS = {
  allowProposedApi: true, // unicode11 + serialize use proposed APIs
  scrollback: 5000,
  fontFamily:
    '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Code", "SF Mono", ui-monospace, Menlo, Consolas, monospace',
  fontSize: 12,
  cursorBlink: true,
  customGlyphs: true,
  rescaleOverlappingGlyphs: true,
  minimumContrastRatio: 4.5,
} as const;

/**
 * Build the Claude terminal: an XtermTerminal plus the persistent wrapper div that moves
 * between workspace containers on attach/detach (the buffer's DOM home survives tab
 * switches — vscode TerminalInstance._wrapperElement), and the layout pipeline (font
 * metrics → scaled dims → resize debouncer → pty resize IPC). `onResize` reports debounced
 * cols/rows for the pty — the store wires it to api.resize(handle.id, …) so a /clear
 * rename keeps resizing the live session (spec §8.8).
 */
export function createXterm(onResize: (cols: number, rows: number) => void): {
  term: XtermLike;
  wrapper: HTMLElement;
  attach: () => void;
  layout: (width: number, height: number) => void;
  flush: () => void;
  forceRefresh: () => void;
  dispose: () => void;
} {
  const xt = new XtermTerminal({
    raw: { ...OPTIONS },
    theme: (mode) => terminalTheme(mode, { cursor: "#2dd4bf" }),
    unicodeVersion: "11",
    openExternal: (url) => void window.api.openExternal(url),
  });

  const wrapper = document.createElement("div");
  wrapper.style.height = "100%";
  wrapper.style.width = "100%";
  // Positioned ancestor for the bottom-aligned .xterm (see index.css): the row count
  // floors, so up to ~1 row of slack remains; parking .xterm at the wrapper's bottom puts
  // that slack above the first line, keeping the prompt flush to the edge.
  wrapper.style.position = "relative";

  const debouncer = new TerminalResizeDebouncer({
    getBufferLength: () => xt.raw.buffer.normal.length,
    isVisible: () => wrapper.isConnected,
    resizeBoth: (cols, rows) => {
      xt.raw.resize(cols, rows);
      onResize(cols, rows);
    },
    resizeX: (cols) => {
      xt.raw.resize(cols, xt.raw.rows);
      onResize(cols, xt.raw.rows);
    },
    resizeY: (rows) => {
      xt.raw.resize(xt.raw.cols, rows);
      onResize(xt.raw.cols, rows);
    },
  });

  let lastDims: { width: number; height: number } | null = null;
  const layout = (width: number, height: number): void => {
    if (width <= 0 || height <= 0) return;
    lastDims = { width, height };
    // Padding-only subtraction (no scrollbar reservation — the overlay thumb floats
    // inside the 8px .xterm inset, spec §7.6) and the unchanged-size skip both live in
    // the shared helper so this math exists in exactly one place (Claude + shell).
    const dims = computeLayoutResize(
      window,
      xt.raw.element,
      xt.getFont(),
      width,
      height,
      xt.raw.cols,
      xt.raw.rows,
    );
    if (!dims) return;
    debouncer.resize(dims.cols, dims.rows);
  };
  // WebGL load/unload changes cell dims — re-run layout with the memoized size.
  const unsubDims = xt.onDidRequestRefreshDimensions(() => {
    if (lastDims) layout(lastDims.width, lastDims.height);
  });

  return {
    term: xt.raw,
    wrapper,
    attach: () => xt.attachToElement(wrapper),
    layout,
    flush: () => debouncer.flush(),
    forceRefresh: () => xt.forceRefresh(),
    dispose: () => {
      unsubDims();
      debouncer.dispose();
      xt.dispose();
    },
  };
}
