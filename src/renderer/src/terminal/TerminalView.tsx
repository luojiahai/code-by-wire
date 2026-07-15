import { useEffect, useRef } from "react";
import { terminalStore } from "./terminal-store-instance";
import { warmTerminalFonts } from "../xterm/font-warmup";
import {
  collectDroppedPaths,
  quotePathForShell,
  transferHasDropCandidates,
} from "../xterm/file-drop";

/**
 * Mounts a Managed session's kept-alive terminal into the workspace. The xterm instance lives in the
 * store across tab switches; this component only attaches its persistent wrapper into the container,
 * lays it out, and reports the new size to the pty. On unmount it DETACHES the wrapper (never disposes), so
 * returning to the session restores its full scrollback — the whole point of the store.
 */
export function TerminalView({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // replayOnCreate only takes effect when create actually makes a NEW handle. App.tsx pre-creates the
    // handle for spawn/adopt/fork, so for those this returns the existing one with replayPending=false and
    // the flag is inert; a brand-new handle here means we're reattaching to a still-live pty after a window
    // refresh, and its replayPending gate (cleared by reattach) is what arms the snapshot replay below.
    const handle = terminalStore.create(sessionId, { replayOnCreate: true });

    if (handle.wrapper.parentElement !== container) {
      container.appendChild(handle.wrapper);
    }

    let disposed = false;
    const sync = () => {
      // Don't lay out against a collapsed or not-yet-laid-out container (vscode layout()
      // bails on width/height <= 0). The ResizeObserver fires again with real dimensions.
      if (container.clientWidth <= 0 || container.clientHeight <= 0) return;
      handle.layout(container.clientWidth, container.clientHeight);
      // Rebuild viewport geometry after every (re)layout — background renders into the
      // detached (offsetHeight 0) wrapper shrink the scroll-area and bury the prompt.
      handle.forceRefresh();
      // Reattach after a refresh: once we have real dimensions, fetch and replay the
      // screen snapshot (gated by handle.replayPending; reattach() is idempotent).
      if (handle.replayPending) {
        void terminalStore.reattach(
          sessionId,
          handle.term.cols,
          handle.term.rows,
        );
      }
    };
    // Coalesce ResizeObserver bursts through rAF — a synchronous resize while sibling
    // panes are mid-transition crashes the WebGL renderer mid texture-atlas rebuild
    // (harmonized from the shell terminal, spec §8.3).
    let pendingFrame = 0;
    const scheduleSync = () => {
      if (pendingFrame) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        if (!disposed) sync();
      });
    };

    const mount = () => {
      if (disposed) return;
      if (!handle.opened) {
        handle.attach(); // one-time: builds xterm's DOM inside the persistent wrapper
        handle.opened = true;
      } else {
        // Re-shown: apply any resize the debouncer deferred while hidden (vscode
        // setVisible(true) flush).
        handle.flush();
      }
      sync();
      scheduleSync(); // re-run next frame in case the flex layout hasn't settled
      handle.term.focus();
    };
    if (!handle.opened) {
      // First open: warm the WebGL atlas's faces (and the font probe) before xterm
      // measures — fitting with fallback metrics picks the wrong grid (spec §8.1).
      void warmTerminalFonts(12).then(mount, mount);
    } else {
      mount();
    }

    const ro = new ResizeObserver(scheduleSync);
    ro.observe(container);

    // Dropping a file onto the Claude Code terminal inserts its path at the prompt, POSIX
    // single-quoted (matching the footer shell terminal). Write to handle.id — not the
    // closed-over sessionId — so a /clear rotation (which mutates handle.id) still lands the
    // path in the live session. preventDefault on dragover makes this a drop target and on drop
    // stops Electron from navigating to the file; the candidate guard lets non-file drags pass.
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
      window.api.terminal.write(
        handle.id,
        `${paths.map((p) => quotePathForShell(p)).join(" ")} `,
      );
      handle.term.focus();
    };
    container.addEventListener("dragenter", onDragOver);
    container.addEventListener("dragover", onDragOver);
    container.addEventListener("drop", onDrop);

    return () => {
      disposed = true;
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      ro.disconnect();
      container.removeEventListener("dragenter", onDragOver);
      container.removeEventListener("dragover", onDragOver);
      container.removeEventListener("drop", onDrop);
      handle.wrapper.remove(); // detach, not dispose — the buffer lives on in the store
    };
  }, [sessionId]);

  return (
    <div
      className="h-full w-full overflow-hidden bg-(--terminal-well-background)"
      data-claude-terminal=""
      ref={containerRef}
    />
  );
}
