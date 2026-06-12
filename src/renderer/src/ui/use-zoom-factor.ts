import { useLayoutEffect } from "react";

/**
 * Keep the document's `--zoom-factor` var in sync with the renderer's web zoom, so the macOS title bar
 * can counter-zoom (the `.title-bar` rule) and hold a fixed physical size under the OS-drawn traffic
 * lights, which don't zoom. Mirrors VS Code: track the factor in a CSS var and let the rule divide by
 * it. Web zoom reflows the viewport, so a `resize` listener catches every change.
 *
 * `enabled` gates the whole thing on macOS — off macOS there are no traffic lights to stay aligned
 * with and the bar should zoom with everything else. We skip the write when the factor is unchanged so
 * a drag-resize (which fires `resize` every frame) doesn't repaint the title bar each time.
 */
export function useZoomFactor(enabled: boolean): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    let last = -1;
    const apply = (): void => {
      const z = window.api.getZoomFactor();
      if (z === last) return;
      last = z;
      document.documentElement.style.setProperty("--zoom-factor", String(z));
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [enabled]);
}
