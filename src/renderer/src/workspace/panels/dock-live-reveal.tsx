import { useLayoutEffect, useRef, type ReactNode } from "react";

// The Activity dock's one-shot reveal (2026-07-18 spec): when a tab's list comes on screen — the dock
// expanding, a tab switch (ActivityDock keys this wrapper by tab), or the workspace mounting with the
// dock open — position the scroll once so the first live row sits roughly centered. Deliberately no
// following: statuses changing while the panel stays open never move the list.

/** Spread onto the DockRow of a live item — under the same condition that applies DOCK_GLYPH_PULSE
 *  (task in_progress, subagent working, shell/monitor running) — to mark it as the reveal target.
 *  A spread rather than a literal attribute because hyphenated props only typecheck on intrinsic
 *  elements, not on DockRow's typed props. */
export const DOCK_LIVE_ROW = { "data-dock-live": "" };

/** Wraps a dock tab's content: on mount, centers the first `data-dock-live` row inside the enclosing
 *  OverlayScroll. Layout-effect + instant scroll (default `behavior: "auto"`), so the panel paints
 *  already positioned instead of visibly scrolling — nothing to guard for reduced motion. With no live
 *  row it does nothing, keeping whatever offset the container already had. */
export function DockLiveReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current
      ?.querySelector("[data-dock-live]")
      ?.scrollIntoView({ block: "center" });
  }, []);
  return <div ref={ref}>{children}</div>;
}
