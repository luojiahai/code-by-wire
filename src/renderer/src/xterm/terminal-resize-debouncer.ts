/** Ported from microsoft/vscode (MIT) — src/vs/workbench/contrib/terminal/browser/
 *  terminalResizeDebouncer.ts — adapted for code-by-wire. Rows are cheap (add/remove
 *  lines); cols force xterm to reflow the whole scrollback, so X coalesces at 100ms.
 *  Small buffers never debounce; invisible terminals defer to idle time. */

export interface TerminalResizeDebouncerOptions {
  /** Normal-buffer line count — below the threshold every resize is immediate. */
  getBufferLength(): number;
  isVisible(): boolean;
  resizeBoth(cols: number, rows: number): void;
  resizeX(cols: number): void;
  resizeY(rows: number): void;
}

const START_DEBOUNCING_THRESHOLD = 200; // lines (vscode :11-17)
const DEBOUNCE_X_MS = 100;

interface IdleHandle {
  cancel(): void;
}

/** requestIdleCallback with a setTimeout fallback (jsdom, older engines). */
function scheduleIdle(cb: () => void): IdleHandle {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const handle = w.requestIdleCallback(cb);
    return { cancel: () => w.cancelIdleCallback(handle) };
  }
  const handle = window.setTimeout(cb, 16);
  return { cancel: () => window.clearTimeout(handle) };
}

export class TerminalResizeDebouncer {
  private latestX = 0;
  private latestY = 0;
  private xTimer = 0;
  private xIdle: IdleHandle | null = null;
  private yIdle: IdleHandle | null = null;
  private disposed = false;

  constructor(private readonly opts: TerminalResizeDebouncerOptions) {}

  resize(cols: number, rows: number, immediate = false): void {
    if (this.disposed) return;
    this.latestX = cols;
    this.latestY = rows;
    if (immediate || this.opts.getBufferLength() < START_DEBOUNCING_THRESHOLD) {
      this.cancel();
      this.opts.resizeBoth(cols, rows);
      return;
    }
    if (!this.opts.isVisible()) {
      // Deferred to idle, coalesced per axis (vscode :59-81).
      this.xIdle ??= scheduleIdle(() => {
        this.xIdle = null;
        this.opts.resizeX(this.latestX);
      });
      this.yIdle ??= scheduleIdle(() => {
        this.yIdle = null;
        this.opts.resizeY(this.latestY);
      });
      return;
    }
    // Visible: Y now, X coalesced — reschedule on every call so a burst resolves
    // 100ms after the LAST call, not the first (vscode RunOnceScheduler.schedule():
    // cancels-and-restarts on every call; src/vs/base/common/async.ts:1223-1226).
    this.opts.resizeY(rows);
    if (this.xTimer) window.clearTimeout(this.xTimer);
    this.xTimer = window.setTimeout(() => {
      this.xTimer = 0;
      this.opts.resizeX(this.latestX);
    }, DEBOUNCE_X_MS);
  }

  /** Apply the latest size immediately if anything is pending (vscode :90-100).
   *  Called when a terminal becomes visible so it never shows a stale grid. */
  flush(): void {
    if (this.disposed) return;
    if (this.xTimer || this.xIdle || this.yIdle) {
      this.cancel();
      this.opts.resizeBoth(this.latestX, this.latestY);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  private cancel(): void {
    if (this.xTimer) {
      window.clearTimeout(this.xTimer);
      this.xTimer = 0;
    }
    this.xIdle?.cancel();
    this.xIdle = null;
    this.yIdle?.cancel();
    this.yIdle = null;
  }
}
