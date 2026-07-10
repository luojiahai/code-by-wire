import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import type { FitLike, XtermLike } from "./terminal-store";
import { viewportScrollTop } from "./viewport-scroll";
import { createWebLinksAddon } from "./web-links";
import { attachOverlayScrollbar } from "./overlay-scrollbar";

/** xterm's internal core, reached the way VSCode does (xtermTerminal.ts: `(raw as ITerminalWithCore)._core`).
 *  We only need the Viewport's `syncScrollArea`, the public hook xterm itself calls (on clear/show) to force
 *  a scroll-geometry rebuild. `viewport` only exists after `open()`. Cast through `unknown` so it stays
 *  type-checked (no `any`); the call site feature-detects `syncScrollArea`, so it degrades gracefully if a
 *  future xterm renames or drops it. */
interface TerminalWithCore {
  _core: { viewport?: { syncScrollArea(immediate?: boolean): void } };
}

/** xterm options tuned for the Claude TUI: generous scrollback, a dark theme matching the app's ink
 *  palette, a monospace stack, and a steady cursor. convertEol stays off — the TUI emits its own.
 *  customGlyphs + rescaleOverlappingGlyphs only take effect under a GPU renderer (see attachWebgl) —
 *  they let xterm draw block/box/quadrant art as vector shapes instead of leaning on font coverage,
 *  which is what fixes the Claude Code mascot. */
const OPTIONS = {
  scrollback: 5000,
  fontFamily:
    '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Code", "SF Mono", ui-monospace, Menlo, Consolas, monospace',
  fontSize: 12,
  cursorBlink: true,
  customGlyphs: true, // draw block/box/powerline glyphs in the atlas, font-independent (default true; inert on the DOM renderer)
  rescaleOverlappingGlyphs: true, // shrink oversized fallback glyphs so they don't bleed into the next cell
  theme: { background: "#080808", foreground: "#eaeaea", cursor: "#2dd4bf" },
} as const;

/** Load the WebGL renderer onto an opened terminal — the renderer VSCode uses, and the one that makes
 *  customGlyphs actually fire (the DOM renderer ignores it). On context loss we dispose the addon, which
 *  reverts xterm to its built-in DOM renderer; if WebGL is unavailable at all (software GL, headless) the
 *  load throws and we keep the DOM renderer. Either way the terminal stays functional. */
function attachWebgl(term: Terminal): void {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {
    // No WebGL — keep the DOM renderer. Block/box art degrades to font rendering; nothing breaks.
  }
}

/**
 * Build a real xterm Terminal + FitAddon and a detached wrapper div the terminal lives in. The wrapper
 * is what moves between workspace containers on attach/detach, so the rendered DOM and buffer persist
 * across tab switches. Renderer-only (imports xterm + its CSS); kept out of the store so unit tests
 * never load the DOM-bound library.
 */
export function createXterm(): {
  term: XtermLike;
  fit: FitLike;
  wrapper: HTMLElement;
  rebuildViewport: () => void;
} {
  const term = new Terminal(OPTIONS);
  const fit = new FitAddon();
  term.loadAddon(fit);
  // URLs in claude's output were plain text before this — the factory loaded only fit + WebGL.
  term.loadAddon(
    createWebLinksAddon((url) => void window.api.openExternal(url)),
  );
  // The WebGL addon needs the canvas, which only exists after the view calls term.open(). Wrap open so
  // the renderer attaches itself right after — keeping all GPU-renderer wiring in this seam, with the
  // view and store untouched. open() is called once (guarded by handle.opened in the view).
  const open = term.open.bind(term);
  let disposeScrollbar: () => void = () => {};
  term.open = (parent: HTMLElement) => {
    open(parent);
    attachWebgl(term);
    disposeScrollbar = attachOverlayScrollbar(parent, term);
  };
  // Wrap dispose the same way as open: tear down the overlay scrollbar's listeners, timer, and thumb node.
  // (xterm disposes loadAddon'd addons like WebGL itself; these raw DOM listeners it doesn't know about.)
  const dispose = term.dispose.bind(term);
  term.dispose = () => {
    disposeScrollbar();
    dispose();
  };
  const wrapper = document.createElement("div");
  wrapper.style.height = "100%";
  wrapper.style.width = "100%";
  // Positioned ancestor for the bottom-aligned .xterm (see index.css): FitAddon floors the row count, so
  // up to ~1 row of slack remains; parking .xterm at the wrapper's bottom puts that slack above the first
  // line instead of below the last, keeping the prompt flush to the edge (mirrors VSCode's terminal.css).
  wrapper.style.position = "relative";
  // Rebuild xterm's viewport scroll geometry against the live element, the way xterm itself does when a
  // backgrounded terminal is shown (it calls viewport.syncScrollArea on clear/show). The view calls this on
  // re-attach. While the wrapper is detached the pty keeps streaming, and every background render runs
  // xterm's refresh with the off-DOM element's offsetHeight of 0 — which shrinks the scroll-area so the last
  // line (the Claude prompt) becomes unreachable, and resets the DOM scrollTop. A no-op fit on re-attach
  // (the ActivityDock pins the terminal to a fixed height, so the size is unchanged and xterm never gets a
  // resize to rebuild on) leaves that stale geometry in place, so we force the rebuild here.
  //
  // syncScrollArea(true) re-syncs the recorded buffer length, rebuilds the scroll-area against the live
  // offsetHeight, and re-pins scrollTop = ydisp * rowHeight using xterm's OWN ignore-flag, so the exact
  // scroll position (bottom or scrolled-up) is restored without the rounding "knock" a manual scrollTop poke
  // causes. Feature-detect it so a future xterm that renames or drops it falls through to re-deriving
  // scrollTop from the live buffer (the pre-rebuild behaviour) rather than throwing.
  const rebuildViewport = () => {
    const vp = (term as unknown as TerminalWithCore)._core.viewport;
    if (typeof vp?.syncScrollArea === "function") {
      vp.syncScrollArea(true);
      return;
    }
    const viewport = wrapper.querySelector(".xterm-viewport");
    if (!(viewport instanceof HTMLElement)) return;
    const buf = term.buffer.active;
    viewport.scrollTop = viewportScrollTop(
      buf.viewportY,
      buf.length,
      viewport.scrollHeight,
    );
  };
  return { term: term, fit, wrapper, rebuildViewport };
}
