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
    const handle = terminalStore.create(sessionId); // get-or-create: same instance + scrollback every time

    if (handle.wrapper.parentElement !== container) {
      container.appendChild(handle.wrapper);
    }
    if (!handle.opened) {
      handle.term.open(handle.wrapper); // one-time: build xterm's DOM inside its persistent wrapper
      handle.opened = true;
    }

    // The wrapper was just re-attached. While it was detached the pty kept streaming, so xterm's
    // background renders recorded the off-DOM element's offsetHeight of 0 — shrinking the scroll-area and
    // resetting the DOM scrollTop, which buries the bottom-most line (the Claude prompt) with no way to
    // scroll down to it. The fit below is a no-op when the size is unchanged (the StructureDock pins the
    // terminal to a fixed height across a tab switch), so xterm never gets a resize to rebuild on — we have
    // to force the geometry rebuild ourselves. It MUST run against a live, non-zero element, so it's driven
    // off the size-gated sync() below and fires only on the first real-sized layout after (re)attach.
    let needsRebuild = true;
    let raf = 0;

    const sync = () => {
      // Don't fit/resize against a collapsed or not-yet-laid-out container — measuring a 0-size element
      // yields a 0/NaN grid and a bogus pty resize, and seeds xterm with junk dimensions (VSCode's
      // layout() bails on width/height <= 0). The ResizeObserver fires again with real dimensions once the
      // flex layout settles.
      if (container.clientWidth <= 0 || container.clientHeight <= 0) return;
      handle.fit.fit();
      window.api.terminal.resize(sessionId, handle.term.cols, handle.term.rows);
      // Rebuild the buried geometry exactly once, the first time we have a real-sized element after
      // (re)attach — never against the 0-size container the guard above bailed on. Later live resizes
      // rebuild through xterm's own fit→resize path, so this only needs to fire here. Force it the way
      // VSCode does on show (forceRefresh), then again next frame in case the surrounding flex layout
      // hasn't settled this tick; it's idempotent and pins scrollTop without a rounding knock, so the
      // exact position is restored.
      if (!needsRebuild) return;
      needsRebuild = false;
      handle.rebuildViewport();
      raf = requestAnimationFrame(() => handle.rebuildViewport());
    };
    sync();
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
