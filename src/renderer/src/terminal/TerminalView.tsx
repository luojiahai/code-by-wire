import { useEffect, useRef } from "react";
import { terminalStore } from "./terminal-store-instance";

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
    const isNewHandle = !terminalStore.get(sessionId);
    // replayOnCreate only takes effect when create actually makes a NEW handle. App.tsx pre-creates the
    // handle for spawn/adopt/fork, so for those this returns the existing one and the flag is inert; a
    // brand-new handle here means we're reattaching to a still-live pty after a window refresh.
    const handle = terminalStore.create(sessionId, { replayOnCreate: true });

    if (handle.wrapper.parentElement !== container) {
      container.appendChild(handle.wrapper);
    }
    if (!handle.opened) {
      handle.term.open(handle.wrapper); // one-time: build xterm's DOM inside its persistent wrapper
      handle.opened = true;
    }

    let reattachStarted = false;
    const sync = () => {
      if (container.clientWidth <= 0 || container.clientHeight <= 0) return;
      handle.fit.fit();
      window.api.terminal.resize(sessionId, handle.term.cols, handle.term.rows);
      handle.rebuildViewport();
      // Reattach after a refresh: once we have real dimensions, fetch and replay the screen snapshot once.
      // The store gated live output at create time, so this lands the snapshot before any live chunk.
      if (isNewHandle && handle.replayPending && !reattachStarted) {
        reattachStarted = true;
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

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      handle.wrapper.remove(); // detach, not dispose — the buffer goes back to living off-DOM in the store
    };
  }, [sessionId]);

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden bg-well" />
  );
}
