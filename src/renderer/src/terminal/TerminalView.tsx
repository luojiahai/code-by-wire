import { useEffect, useRef } from "react";
import { terminalStore } from "./terminal-store-instance";
import {
  collectDroppedPaths,
  quotePosixPath,
  transferHasDropCandidates,
} from "./file-drop";

/**
 * Mounts a Managed session's kept-alive terminal into the workspace. The xterm instance lives in the
 * store across tab switches; this component only attaches its persistent wrapper into the container,
 * fits it, and reports the new size to the pty. On unmount it DETACHES the wrapper (never disposes), so
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
    if (!handle.opened) {
      handle.term.open(handle.wrapper); // one-time: build xterm's DOM inside its persistent wrapper
      handle.opened = true;
    }

    const sync = () => {
      // Don't fit/resize against a collapsed or not-yet-laid-out container — measuring a 0-size element
      // yields a 0/NaN grid and a bogus pty resize, and seeds xterm with junk dimensions (VSCode's
      // layout() bails on width/height <= 0). The ResizeObserver fires again with real dimensions once the
      // flex layout settles.
      if (container.clientWidth <= 0 || container.clientHeight <= 0) return;
      handle.fit.fit();
      window.api.terminal.resize(sessionId, handle.term.cols, handle.term.rows);
      // Rebuild xterm's viewport geometry against the live element after every (re)layout. While the wrapper
      // was detached the pty kept streaming, so background renders recorded the off-DOM offsetHeight of 0 —
      // shrinking the scroll-area and resetting the DOM scrollTop, which buries the bottom-most line (the
      // Claude prompt). The fit above is a no-op when the size is unchanged (the ActivityDock pins a fixed
      // height across a tab switch), so driving this from sync — not just the mount tick — is what lets the
      // ResizeObserver re-run it when a collapsed container later gets its real size; otherwise that stale
      // geometry would survive and the prompt would stay unreachable.
      handle.rebuildViewport();
      // Reattach after a refresh: once we have real dimensions, fetch and replay the screen snapshot. Gated
      // on the handle's own replayPending — not a mount-time flag — so a remount re-arms the reattach that a
      // 0-size first mount deferred (switching to a tab that was collapsed when the window refreshed, or
      // StrictMode's double-mount). reattach() is idempotent: it no-ops once the gate is open or a fetch is
      // already in flight, so the repeated sync calls on one mount fetch the snapshot only once.
      if (handle.replayPending) {
        void terminalStore.reattach(
          sessionId,
          handle.term.cols,
          handle.term.rows,
        );
      }
    };
    sync();
    // Re-run next frame in case the flex layout hasn't settled this tick: the ResizeObserver only fires on a
    // size change, so a same-size settle wouldn't otherwise re-drive the rebuild. sync self-guards on a
    // 0-size container and is idempotent.
    let raf = 0;
    raf = requestAnimationFrame(sync);
    handle.term.focus();

    const ro = new ResizeObserver(sync);
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
        `${paths.map(quotePosixPath).join(" ")} `,
      );
      handle.term.focus();
    };
    container.addEventListener("dragenter", onDragOver);
    container.addEventListener("dragover", onDragOver);
    container.addEventListener("drop", onDrop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener("dragenter", onDragOver);
      container.removeEventListener("dragover", onDragOver);
      container.removeEventListener("drop", onDrop);
      handle.wrapper.remove(); // detach, not dispose — the buffer goes back to living off-DOM in the store
    };
  }, [sessionId]);

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden bg-well" />
  );
}
