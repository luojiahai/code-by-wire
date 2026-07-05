import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { newSessionId } from "@shared/terminal";
import { createWebLinksAddon } from "../terminal/web-links";
import {
  cleanReviveSnapshot,
  keepEscapeSequences,
  quotePathForShell,
  stripEscapeSequences,
  stripInitialPromptGap,
} from "./revive";
import { shellRouter } from "./router-instance";
import { resolveSurfaceColor, terminalTheme } from "./theme";
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

// Bind the palette to the live app surface so the terminal blends in (and the contrast clamp has
// a real background to work against).
function withSurface(theme: ReturnType<typeof terminalTheme>) {
  const surface = resolveSurfaceColor(theme.background ?? "#1e1e1e");
  return { ...theme, background: surface, cursorAccent: surface };
}

function transferHasDropCandidates(t: DataTransfer): boolean {
  if ((t.files?.length ?? 0) > 0) return true;
  for (let i = 0; i < (t.items?.length ?? 0); i += 1) {
    if (t.items[i]?.kind === "file") return true;
  }
  return false;
}

function collectDroppedPaths(t: DataTransfer): string[] {
  const seen = new Set<string>();
  const addFile = (file: File | null): void => {
    if (!file) return;
    try {
      const path = window.api.getPathForFile(file);
      if (typeof path === "string" && path.trim()) seen.add(path.trim());
    } catch {
      // File handle unavailable.
    }
  };
  for (let i = 0; i < (t.files?.length ?? 0); i += 1) addFile(t.files.item(i));
  for (let i = 0; i < (t.items?.length ?? 0); i += 1) {
    const item = t.items[i];
    if (item?.kind === "file") addFile(item.getAsFile());
  }
  return [...seen];
}

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
  const termRef = useRef<Terminal | null>(null);
  const webglRef = useRef<WebglAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Snapshot the revive buffer once: live snapshots feed updateTerminalReviveBuffer and would
  // otherwise re-arm replay on every store-driven re-render.
  const initialReviveBufferRef = useRef(reviveBuffer);
  const shellNameRef = useRef("shell");
  const onShellRef = useRef(onShell);
  // Re-fit on activation: a hidden tab's host had stale dims by the time it's shown again.
  const fitRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("starting");

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
    let lastSentSize: { cols: number; rows: number } | null = null;

    const term = new Terminal({
      allowProposedApi: true,
      // Opaque canvas = WebGL's crisp fast-path (VS Code keeps transparency off; our surface is
      // opaque anyway, so withSurface paints it solid).
      allowTransparency: false,
      convertEol: true,
      cursorBlink: true,
      // ⟨cbw⟩ hermes' stack with the app's actual bundled face (fontsource variable) first.
      fontFamily:
        "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
      fontSize: 11,
      fontWeight: "normal",
      fontWeightBold: "bold",
      letterSpacing: 0,
      lineHeight: 1.12,
      // ⌥-drag (macOS) forces a native selection over mouse-mode TUIs.
      macOptionClickForcesSelection: true,
      macOptionIsMeta: true,
      // VS Code's terminal.integrated.minimumContrastRatio default; xterm's default is 1 (off),
      // which paints the raw saturated ANSI palette.
      minimumContrastRatio: 4.5,
      scrollback: 1000,
      theme: withSurface(terminalTheme()),
    });

    const fit = new FitAddon();
    const serialize = new SerializeAddon();
    termRef.current = term;
    term.loadAddon(fit);
    term.loadAddon(serialize);
    term.loadAddon(new Unicode11Addon());
    // ⟨cbw⟩ explicit handler through the http(s)-guarded IPC (no setWindowOpenHandler in main).
    term.loadAddon(
      createWebLinksAddon((url) => void window.api.openExternal(url)),
    );
    term.unicode.activeVersion = "11";

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
      if (disposed) return;
      lastSnapshotAt = Date.now();
      try {
        const snapshot = serialize.serialize({
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
      const paths = collectDroppedPaths(e.dataTransfer);
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

    const fitAndResize = (): void => {
      if (
        disposed ||
        !host.isConnected ||
        host.clientWidth <= 0 ||
        host.clientHeight <= 0
      ) {
        return;
      }
      try {
        fit.fit();
      } catch {
        return;
      }
      if (
        lastSentSize?.cols !== term.cols ||
        lastSentSize?.rows !== term.rows
      ) {
        lastSentSize = { cols: term.cols, rows: term.rows };
        api.resize(sessionId, term.cols, term.rows);
      }
    };
    fitRef.current = fitAndResize;

    // Coalesce ResizeObserver bursts through rAF — a synchronous fit while sibling panes are
    // mid-transition crashes the WebGL renderer mid texture-atlas rebuild.
    let pendingFrame = 0;
    const scheduleResize = (): void => {
      if (pendingFrame) return;
      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = 0;
        if (!disposed) fitAndResize();
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

    const startSession = (): void =>
      void api
        .spawn({ id: sessionId, cwd, cols: term.cols, rows: term.rows })
        .then((session) => {
          if (disposed) return; // cleanup already sent the kill
          lastSentSize = { cols: term.cols, rows: term.rows };
          shellNameRef.current = session.shell || "shell";
          onShellRef.current?.(session.shell || "shell");
          setStatus("open");
          window.requestAnimationFrame(() => {
            fitAndResize();
            term.clearSelection(); // drop any selection painted over transient boot rows
            term.focus();
          });
        })
        .catch((error: unknown) => {
          setStatus("closed");
          term.write(
            `\r\n\x1b[31mTerminal failed to start: ${
              error instanceof Error ? error.message : String(error)
            }\x1b[0m\r\n`,
          );
        });

    // Open + fit + start only once webfonts settle: fitting with fallback metrics picks the wrong
    // row count (shell boots, real font loads, refit, SIGWINCH, prompt reprints lower).
    const mount = (): void => {
      if (disposed || !host.isConnected) return;
      term.open(host);
      term.focus();
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => {
          webgl.dispose();
          webglRef.current = null;
        });
        term.loadAddon(webgl);
        webglRef.current = webgl;
      } catch (err) {
        console.warn(
          "[shell-terminal] WebGL unavailable; falling back to DOM",
          err,
        );
      }
      fitAndResize();
      startSession();
    };

    // Warm the faces the WebGL atlas needs up front, or it bakes a fallback face and the terminal
    // renders thin until a repaint.
    const warm = document.fonts?.load
      ? Promise.allSettled(
          ["400", "700", "italic 400"].map((v) =>
            document.fonts.load(`${v} 11px 'JetBrains Mono Variable'`),
          ),
        )
      : Promise.resolve();
    void warm.then(mount, mount);

    return () => {
      disposed = true;
      cleanup.forEach((run) => run()); // unregisters the router FIRST — late chunks get stray-acked
      fitRef.current = null;
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sid) api.kill(sid); // fire-and-forget; ordered after the earlier spawn invoke on the same pipe
      term.dispose();
      termRef.current = null;
      webglRef.current = null;
    };
    // `id` is stable for the instance's life (keyed by tab id); it satisfies the deps check for
    // the closeTerminal(id) call in onExit without re-creating the shell.
  }, [cwd, id]);

  // On (re)activation: a WebGL terminal doesn't paint while visibility:hidden, so it reveals a
  // stale frame. Refit, rebuild the glyph atlas, force a full redraw, then focus.
  useEffect(() => {
    if (!active || status !== "open") return;
    const frame = requestAnimationFrame(() => {
      const term = termRef.current;
      fitRef.current?.();
      webglRef.current?.clearTextureAtlas();
      term?.refresh(0, term.rows - 1);
      term?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, status]);

  return { hostRef, status };
}
