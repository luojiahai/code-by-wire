import type { SerializeAddon } from "@xterm/addon-serialize";
import { useEffect, useRef, useState } from "react";
import { newSessionId } from "@shared/terminal";
import { osKind } from "@shared/platform";
import { tNow } from "../i18n";
import { XtermTerminal } from "../xterm/xterm-terminal";
import { terminalTheme } from "../xterm/terminal-theme";
import { TerminalResizeDebouncer } from "../xterm/terminal-resize-debouncer";
import { computeLayoutResize } from "../xterm/terminal-font-metrics";
import { warmTerminalFonts } from "../xterm/font-warmup";
import {
  collectDroppedPaths,
  quotePathForShell,
  transferHasDropCandidates,
} from "../xterm/file-drop";
import {
  cleanReviveSnapshot,
  keepEscapeSequences,
  stripEscapeSequences,
  stripInitialPromptGap,
} from "./revive";
import { shellRouter } from "./router-instance";
import { macEditSequence } from "../ui/mac-edit-sequence";
import { clipboardKeyAction } from "../xterm/clipboard-keys";
import {
  attachClipboardContextMenu,
  runClipboardAction,
  type ClipboardActionDeps,
} from "../xterm/clipboard-actions";
import { closeTerminal, updateTerminalReviveBuffer } from "./terminals";

// How many scrollback lines to serialize for relaunch restore (VS Code's
// persistentSessionScrollback default); the store caps the resulting string.
const PERSISTENT_SESSION_SCROLLBACK = 200;

// Leading-edge throttle for capturing history: the first output after an idle gap persists almost
// immediately (so `cmd; quit` is on disk before teardown), then at most once per window.
const SNAPSHOT_THROTTLE_MS = 750;

// True once the app is tearing down (quit, reload). Quit kills the ptys from main, which fires
// exit here — but React skips effect cleanups on teardown, so the per-instance `disposed` flag
// never flips. Without this guard those exits would closeTerminal() and wipe the persisted tab
// list right before relaunch reads it. A real `exit`/Ctrl-D still closes the tab (flag stays false).
let appTearingDown = false;
if (typeof window !== "undefined") {
  const markTearingDown = (): void => {
    appTearingDown = true;
  };
  window.addEventListener("pagehide", markTearingDown);
  window.addEventListener("beforeunload", markTearingDown);
}

type TerminalStatus = "starting" | "open" | "closed";

interface UseTerminalSessionOptions {
  /** Renderer-side tab id (keys the tab store; NOT the pty session id). */
  id: string;
  cwd: string;
  /** Only the active tab is visible; (re)activation refits and refocuses. */
  active: boolean;
  /** Serialized scrollback from the previous run, replayed once on mount. */
  reviveBuffer?: string;
  /** Reports the resolved shell name once the pty is live (the tab label). */
  onShell?: (shell: string) => void;
}

export function useTerminalSession({
  id,
  cwd,
  active,
  reviveBuffer,
  onShell,
}: UseTerminalSessionOptions) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XtermTerminal["raw"] | null>(null);
  const xtRef = useRef<XtermTerminal | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Snapshot the revive buffer once: live snapshots feed updateTerminalReviveBuffer and would
  // otherwise re-arm replay on every store-driven re-render.
  const initialReviveBufferRef = useRef(reviveBuffer);
  const shellNameRef = useRef("shell");
  const onShellRef = useRef(onShell);
  // Re-fit on activation: a hidden tab's host had stale dims by the time it's shown again.
  const fitRef = useRef<(() => void) | null>(null);
  // Flushes the resize debouncer's deferred edge on reactivation — a hidden tab defers its X/Y
  // resize to idle callbacks; showing it again must apply them immediately, not wait for idle.
  const flushRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("starting");

  // The debouncer reads this on every resize to decide whether to defer to idle. It's a ref (not
  // the `active` prop directly) because the effect below creates the debouncer once per [cwd, id]
  // and would otherwise close over `active`'s initial value for the instance's whole lifetime.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    onShellRef.current = onShell;
  }, [onShell]);

  useEffect(() => {
    const host = hostRef.current;
    const api = window.api.shellTerminal;
    if (!host || !api) {
      setStatus("closed");
      return;
    }

    let disposed = false;
    const cleanup: Array<() => void> = [];

    const xt = new XtermTerminal({
      raw: {
        allowProposedApi: true,
        // Opaque canvas = WebGL's crisp fast-path (VS Code keeps transparency off).
        allowTransparency: false,
        convertEol: true,
        cursorBlink: true,
        customGlyphs: true, // converged with the Claude terminal (spec §8.13)
        rescaleOverlappingGlyphs: true,
        fontFamily:
          "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
        fontSize: 11,
        fontWeight: "normal",
        fontWeightBold: "bold",
        letterSpacing: 0,
        lineHeight: 1.12,
        macOptionClickForcesSelection: true,
        macOptionIsMeta: true,
        minimumContrastRatio: 4.5,
        scrollback: 1000,
      },
      theme: (mode) => terminalTheme(mode),
      unicodeVersion: "11",
      openExternal: (url) => void window.api.openExternal(url),
      // No scrollbarHost override: `host` (instance.tsx's ref target) is itself the
      // positioned ancestor .xterm's own absolute/inset CSS binds to (it's `relative`),
      // so the default (attach to `container` itself) is already correct.
    });
    const term = xt.raw;
    termRef.current = term;
    xtRef.current = xt;

    // Resident before the first throttled snapshot (spec §6): the addon loads async off the
    // shared importer, so kicking it off here — rather than lazily inside persistSnapshot — means
    // it's already loaded by the time the shell produces its first idle gap.
    let serializeAddon: SerializeAddon | null = null;
    void xt.getSerializeAddon().then((addon) => {
      if (!disposed) serializeAddon = addon;
    });

    // Replay last run's scrollback before the fresh shell boots. The process is NOT revived — a
    // new shell starts one line below the restored history.
    const initialReviveBuffer = initialReviveBufferRef.current;
    if (initialReviveBuffer) {
      term.write(initialReviveBuffer);
      term.write("\r\n");
    }

    // Capture the buffer on a leading-edge throttle and persist synchronously via the store. No
    // unload hook: by quit time a recent snapshot is already on disk.
    let snapshotTimer = 0;
    let lastSnapshotAt = 0;
    const persistSnapshot = (): void => {
      if (disposed || !serializeAddon) return;
      lastSnapshotAt = Date.now();
      try {
        const snapshot = serializeAddon.serialize({
          scrollback: PERSISTENT_SESSION_SCROLLBACK,
        });
        updateTerminalReviveBuffer(id, cleanReviveSnapshot(snapshot));
      } catch {
        // Best-effort restore: never let serialization break a live terminal.
      }
    };
    const scheduleSnapshot = (): void => {
      if (snapshotTimer) return;
      const elapsed = Date.now() - lastSnapshotAt;
      if (elapsed >= SNAPSHOT_THROTTLE_MS) {
        persistSnapshot();
        return;
      }
      snapshotTimer = window.setTimeout(() => {
        snapshotTimer = 0;
        persistSnapshot();
      }, SNAPSHOT_THROTTLE_MS - elapsed);
    };
    cleanup.push(() => {
      if (snapshotTimer) window.clearTimeout(snapshotTimer);
    });

    // ⟨cbw⟩ mint the pty session id HERE and register the router handler BEFORE spawning — the
    // race-free ordering the Managed surface uses (the first bytes land on a live handler, and
    // every chunk is acked exactly once).
    const sessionId = newSessionId();
    sessionIdRef.current = sessionId;

    // While armed, strip leading blank rows so the first prompt lands at the very top. Applied
    // only to renderer output — never inject cleanup keystrokes into the user's shell. The done
    // callback fires when xterm has PARSED what we wrote (or immediately when nothing was worth
    // writing) — the ack must credit the FULL chunk length either way, or flow-control credit
    // leaks on stripped chunks.
    let stripLeading = true;
    const armedWrite = (data: string, done: () => void): void => {
      if (!stripLeading) {
        term.write(data, done);
        return;
      }
      const next = stripInitialPromptGap(data);
      const visible = stripEscapeSequences(next).replace(/[\s%]/g, "");
      if (!visible) {
        const controls = keepEscapeSequences(next);
        if (controls) {
          term.write(controls, done);
        } else {
          done();
        }
        return;
      }
      stripLeading = false;
      term.write(next, done);
    };

    cleanup.push(
      shellRouter.register(sessionId, {
        onData: (data) => {
          armedWrite(data, () =>
            shellRouter.ackConsumed(sessionId, data.length),
          );
          scheduleSnapshot();
        },
        onExit: () => {
          // Shell exited (`exit` / Ctrl-D / crash) — drop the tab like a real terminal; the store
          // hides the pane when it was the last one. Skip while tearing down (see appTearingDown)
          // or when this instance's own cleanup killed the pty.
          if (!disposed && !appTearingDown) closeTerminal(id);
        },
      }),
    );

    const onDragOver = (e: DragEvent): void => {
      if (!e.dataTransfer || !transferHasDropCandidates(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (e: DragEvent): void => {
      if (!e.dataTransfer || !transferHasDropCandidates(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      const paths = collectDroppedPaths(e.dataTransfer, (f) =>
        window.api.getPathForFile(f),
      );
      if (!paths.length) return;
      api.write(
        sessionId,
        `${paths.map((p) => quotePathForShell(p, shellNameRef.current)).join(" ")} `,
      );
      term.focus();
    };
    host.addEventListener("dragenter", onDragOver);
    host.addEventListener("dragover", onDragOver);
    host.addEventListener("drop", onDrop);
    cleanup.push(() => {
      host.removeEventListener("dragenter", onDragOver);
      host.removeEventListener("dragover", onDragOver);
      host.removeEventListener("drop", onDrop);
    });

    const debouncer = new TerminalResizeDebouncer({
      getBufferLength: () => term.buffer.normal.length,
      isVisible: () => activeRef.current,
      resizeBoth: (cols, rows) => {
        term.resize(cols, rows);
        api.resize(sessionId, cols, rows);
      },
      resizeX: (cols) => {
        term.resize(cols, term.rows);
        api.resize(sessionId, cols, term.rows);
      },
      resizeY: (rows) => {
        term.resize(term.cols, rows);
        api.resize(sessionId, term.cols, rows);
      },
    });
    cleanup.push(() => debouncer.dispose());
    flushRef.current = () => debouncer.flush();

    let lastDims: { width: number; height: number } | null = null;
    const layout = (): void => {
      if (
        disposed ||
        !host.isConnected ||
        host.clientWidth <= 0 ||
        host.clientHeight <= 0
      ) {
        return;
      }
      lastDims = { width: host.clientWidth, height: host.clientHeight };
      // Shared with the Claude terminal (xterm/terminal-font-metrics.ts): padding-only
      // subtraction + the unchanged-size skip live in one place.
      const dims = computeLayoutResize(
        window,
        term.element,
        xt.getFont(),
        lastDims.width,
        lastDims.height,
        term.cols,
        term.rows,
      );
      if (!dims) return;
      debouncer.resize(dims.cols, dims.rows);
    };
    fitRef.current = layout;
    cleanup.push(
      xt.onDidRequestRefreshDimensions(() => {
        if (!disposed) layout();
      }),
    );

    // Coalesce ResizeObserver bursts through rAF (unchanged rationale).
    let pendingFrame = 0;
    const scheduleResize = (): void => {
      if (pendingFrame) return;
      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = 0;
        if (!disposed) layout();
      });
    };
    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(host);
    cleanup.push(() => {
      resizeObserver.disconnect();
      if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
    });

    const dataDisposable = term.onData((data) => api.write(sessionId, data));
    cleanup.push(() => dataDisposable.dispose());

    // macOS readline word-navigation (cmd/option + arrows/Backspace/Delete) — xterm's own
    // arrow-modifier sequences aren't interpreted by the shell's line editor, so without this the
    // keys are inert (see ui/mac-edit-sequence for the byte table). Unlike the Claude Code terminal,
    // there's no Shift+Enter remap here: a real shell reads bare Enter as submit and that must stay
    // untouched. Clipboard combos run first on every platform (win/linux copy/paste — mac rides
    // the native menu, see clipboard-keys).
    const os = osKind(window.api.platform);
    const clipDeps: ClipboardActionDeps = {
      term,
      writePty: (data) => api.write(sessionId, data),
      clipboard: {
        readText: (type) => window.api.clipboardReadText(type),
        writeText: (text) => window.api.clipboardWriteText(text),
      },
    };
    term.attachCustomKeyEventHandler((e) => {
      const action = clipboardKeyAction(e, os, term.hasSelection());
      if (action !== null) {
        e.preventDefault();
        void runClipboardAction(action, clipDeps); // never rejects
        return false; // we own the combo; xterm must not also emit its ^V/^C byte
      }
      if (os !== "mac") return true;
      const seq = macEditSequence(e);
      if (seq === null) return true; // not ours — plain keys, etc.
      e.preventDefault();
      api.write(sessionId, seq);
      return false; // we sent the bytes; stop xterm emitting its own sequence
    });
    // Windows right-click copyPaste on the host (the shell tab's mount element).
    cleanup.push(attachClipboardContextMenu(host, os, clipDeps));

    const startSession = (): void =>
      void api
        .spawn({ id: sessionId, cwd, cols: term.cols, rows: term.rows })
        .then((session) => {
          if (disposed) return; // cleanup already sent the kill
          shellNameRef.current = session.shell || "shell";
          onShellRef.current?.(session.shell || "shell");
          setStatus("open");
          window.requestAnimationFrame(() => {
            layout();
            term.clearSelection(); // drop any selection painted over transient boot rows
            term.focus();
          });
        })
        .catch((error: unknown) => {
          setStatus("closed");
          term.write(
            `\r\n\x1b[31m${tNow().terminal.spawnFailed(
              error instanceof Error ? error.message : String(error),
            )}\x1b[0m\r\n`,
          );
        });

    // Open + fit + start only once webfonts settle: fitting with fallback metrics picks the wrong
    // row count (shell boots, real font loads, refit, SIGWINCH, prompt reprints lower).
    const mount = (): void => {
      if (disposed || !host.isConnected) return;
      xt.attachToElement(host);
      term.focus();
      layout();
      startSession();
    };
    void warmTerminalFonts(11).then(mount, mount);

    return () => {
      disposed = true;
      cleanup.forEach((run) => run()); // unregisters the router FIRST — late chunks get stray-acked
      fitRef.current = null;
      flushRef.current = null;
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sid) api.kill(sid); // fire-and-forget; ordered after the earlier spawn invoke on the same pipe
      xt.dispose();
      termRef.current = null;
      xtRef.current = null;
    };
    // `id` is stable for the instance's life (keyed by tab id); it satisfies the deps check for
    // the closeTerminal(id) call in onExit without re-creating the shell.
  }, [cwd, id]);

  // On (re)activation: a WebGL terminal doesn't paint while visibility:hidden, so it reveals a
  // stale frame. Flush the resize the debouncer deferred while hidden, refit, force a full
  // redraw + atlas rebuild, then focus.
  useEffect(() => {
    if (!active || status !== "open") return;
    const frame = requestAnimationFrame(() => {
      const xt = xtRef.current;
      flushRef.current?.();
      fitRef.current?.();
      xt?.forceRedraw();
      xt?.raw.refresh(0, xt.raw.rows - 1);
      xt?.raw.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, status]);

  return { hostRef, status };
}
