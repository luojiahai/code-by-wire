/** Ported from microsoft/vscode (MIT) — src/vs/workbench/contrib/terminal/browser/xterm/
 *  xtermTerminal.ts — adapted for code-by-wire. Owns the raw xterm.js instance, addons,
 *  the WebGL/DOM renderer, and theming. Interaction with the backing process is out of
 *  scope of this class (vscode xtermTerminal.ts:112-115) — pty/IPC wiring stays with the
 *  consumers (terminal-store/TerminalView, use-terminal-session). */
import { Terminal, type ITerminalOptions, type ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { SerializeAddon } from "@xterm/addon-serialize";
import type { WebglAddon } from "@xterm/addon-webgl";
import { $terminalTheme } from "../ui/appearance-store";
import { attachOverlayScrollbar } from "./overlay-scrollbar";
import { XtermAddonImporter } from "./xterm-addon-importer";
import { measureFont, type TerminalFont } from "./terminal-font-metrics";
import { viewportScrollTop } from "./viewport-scroll";

export interface XtermTerminalOptions {
  /** Full per-terminal xterm.js options. `theme` is managed by the class — never set here. */
  raw: ITerminalOptions;
  /** Mode → full ITheme. Applied at construction; re-applied live on $terminalTheme change. */
  theme: (mode: "dark" | "light") => ITheme;
  /** vscode config.unicodeVersion analogue — loads unicode11 via the importer when "11". */
  unicodeVersion?: "6" | "11";
  /** Loads the web-links addon wired to this opener (kept deviation, spec §7.2). */
  openExternal?: (url: string) => void;
  /** Overlay-scrollbar mount relative to the open() container. Default: the container. */
  scrollbarHost?: (container: HTMLElement) => HTMLElement;
}

/** One WebGL failure demotes every later terminal to the DOM renderer app-wide — a port of
 *  vscode's static XtermTerminal._suggestedRendererType latch (xtermTerminal.ts:125). */
let suggestedRenderer: "dom" | undefined;

/** xterm's private core, reached the way VSCode does. Feature-detected at every use so a
 *  future xterm that renames these degrades gracefully instead of throwing. */
interface TerminalWithCore {
  _core: {
    viewport?: { syncScrollArea(immediate?: boolean): void };
    _renderService?: {
      dimensions?: { css?: { cell?: { width: number; height: number } } };
    };
  };
}

export class XtermTerminal {
  readonly raw: Terminal;

  private readonly options: XtermTerminalOptions;
  private readonly importer = new XtermAddonImporter();
  private webgl: WebglAddon | null = null;
  private serializePromise: Promise<SerializeAddon> | null = null;
  private disposed = false;
  private readonly disposables: Array<() => void> = [];
  private readonly refreshDimensionsListeners = new Set<() => void>();

  constructor(options: XtermTerminalOptions) {
    this.options = options;
    this.raw = new Terminal({
      ...options.raw,
      theme: options.theme($terminalTheme.get()),
    });
    // Live re-theme: the instance is long-lived, so a later Settings change must reassign
    // its theme (vscode: onDidColorThemeChange → _updateTheme).
    this.disposables.push(
      $terminalTheme.subscribe((mode) => {
        this.raw.options.theme = this.options.theme(mode);
      }),
    );
    if (options.unicodeVersion === "11") {
      void this.importer.importAddon("unicode11").then((Unicode11Addon) => {
        if (this.disposed) return;
        this.raw.loadAddon(new Unicode11Addon());
        this.raw.unicode.activeVersion = "11";
      });
    }
    if (options.openExternal) {
      const open = options.openExternal;
      // Lazy like the importer addons, but through our wrapper module (it carries the
      // http(s)-guarded IPC handler), not a bare @xterm ctor.
      void import("./web-links").then((m) => {
        if (this.disposed) return;
        this.raw.loadAddon(m.createWebLinksAddon(open));
      });
    }
  }

  /** Open into `container` + enable the GPU renderer + attach the overlay scrollbar.
   *  Idempotent re-attach: cbw is single-window, so unlike vscode (which re-runs
   *  raw.open to re-bind a possibly different window, terminalInstance.ts:1067-1072) a
   *  re-attach only needs refresh(); the DOM subtree moves with the caller's wrapper. */
  attachToElement(container: HTMLElement): void {
    if (this.raw.element) {
      this.refresh();
      return;
    }
    this.raw.open(container);
    void this.enableWebgl();
    const host = this.options.scrollbarHost?.(container) ?? container;
    this.disposables.push(attachOverlayScrollbar(host, this.raw));
  }

  get isGpuAccelerated(): boolean {
    return this.webgl !== null;
  }

  /** Clear the WebGL texture atlas + full repaint (vscode forceRedraw → clearTextureAtlas).
   *  Used by the shell rail when a hidden tab is re-shown with a stale frame. */
  forceRedraw(): void {
    this.raw.clearTextureAtlas();
  }

  /** Rebuild xterm's viewport scroll geometry against the live element — the Claude
   *  terminal's reattach fix, under vscode's forceRefresh name. syncScrollArea(true)
   *  re-syncs the recorded buffer length and re-pins scrollTop with xterm's own
   *  ignore-flag; the fallback re-derives scrollTop from the live buffer. */
  forceRefresh(): void {
    const vp = (this.raw as unknown as TerminalWithCore)._core.viewport;
    if (typeof vp?.syncScrollArea === "function") {
      vp.syncScrollArea(true);
      return;
    }
    const viewport = this.raw.element?.querySelector(".xterm-viewport");
    if (!(viewport instanceof HTMLElement)) return;
    const buf = this.raw.buffer.active;
    viewport.scrollTop = viewportScrollTop(
      buf.viewportY,
      buf.length,
      viewport.scrollHeight,
    );
  }

  /** Re-apply the current theme (vscode refresh(), used after a host move). */
  refresh(): void {
    this.raw.options.theme = this.options.theme($terminalTheme.get());
  }

  /** Font metrics for the layout math: prefer the live renderer's cell dims via the
   *  private core (vscode getFont(w, _core) → _renderService.dimensions.css.cell), else
   *  the DOM probe. Keeps every private-core cast inside this class. */
  getFont(): TerminalFont {
    const o = this.raw.options;
    const font: TerminalFont = {
      fontFamily: o.fontFamily ?? "monospace",
      fontSize: o.fontSize ?? 12,
      letterSpacing: o.letterSpacing ?? 0,
      lineHeight: o.lineHeight ?? 1,
    };
    const cell = (this.raw as unknown as TerminalWithCore)._core._renderService
      ?.dimensions?.css?.cell;
    if (cell?.width && cell.height) {
      font.charHeight = cell.height / font.lineHeight;
      font.charWidth =
        cell.width - Math.round(font.letterSpacing) / window.devicePixelRatio;
      return font;
    }
    const measured = measureFont(
      window,
      font.fontFamily,
      font.fontSize,
      font.letterSpacing,
    );
    if (measured) {
      font.charWidth = measured.charWidth;
      font.charHeight = measured.charHeight;
    }
    return font;
  }

  /** Lazy serialize addon, cached (vscode's _serializeAddon pattern). */
  getSerializeAddon(): Promise<SerializeAddon> {
    this.serializePromise ??= this.importer
      .importAddon("serialize")
      .then((SerializeCtor) => {
        const addon = new SerializeCtor();
        if (!this.disposed) this.raw.loadAddon(addon);
        return addon;
      });
    return this.serializePromise;
  }

  /** WebGL load/unload changes cell dimensions — consumers re-run layout with their
   *  memoized dims (vscode onDidRequestRefreshDimensions). Returns an unsubscribe. */
  onDidRequestRefreshDimensions(cb: () => void): () => void {
    this.refreshDimensionsListeners.add(cb);
    return () => this.refreshDimensionsListeners.delete(cb);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.refreshDimensionsListeners.clear();
    this.disposeWebgl();
    this.disposables.forEach((run) => run());
    this.raw.dispose();
  }

  private async enableWebgl(): Promise<void> {
    if (suggestedRenderer === "dom" || this.webgl) return;
    try {
      const WebglCtor = await this.importer.importAddon("webgl");
      if (this.disposed || this.webgl) return;
      const webgl = new WebglCtor();
      webgl.onContextLoss(() => {
        console.warn(
          "[xterm] WebGL context lost; falling back to the DOM renderer",
        );
        this.disposeWebgl();
      });
      this.raw.loadAddon(webgl);
      this.webgl = webgl;
      this.fireRefreshDimensions();
    } catch (err) {
      console.warn(
        "[xterm] WebGL unavailable; falling back to the DOM renderer",
        err,
      );
      suggestedRenderer = "dom";
      this.disposeWebgl();
    }
  }

  private disposeWebgl(): void {
    if (!this.webgl) return;
    try {
      this.webgl.dispose();
    } catch {
      // Disposing a context-lost addon can throw; the fallback still proceeds.
    }
    this.webgl = null;
    this.fireRefreshDimensions();
  }

  private fireRefreshDimensions(): void {
    if (this.disposed) return;
    for (const cb of this.refreshDimensionsListeners) cb();
  }
}
