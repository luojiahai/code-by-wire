import { Wordmark, cx } from "./atoms";
import { useZoomFactor } from "./use-zoom-factor";
import { useFullscreen } from "./use-fullscreen";
import { HEADER_HEIGHT_PX, headerLeftPaddingPx } from "@shared/chrome";
import { isMacPlatform } from "@shared/platform";

/**
 * The frameless app's title bar: a draggable strip carrying the wordmark, anchored top-left. On macOS
 * the wordmark sits past the native traffic lights when windowed; in fullscreen the lights are gone, so
 * its left inset drops and it slides into the corner (see `headerLeftPaddingPx`). The `title-bar` class
 * counter-zooms so the bar holds a fixed physical size while the rest of the window zooms — otherwise
 * web zoom shrinks the bar under the OS-drawn traffic lights, which don't zoom, and they hang off it.
 * Off macOS there are no traffic lights, so the bar zooms with everything else and never insets. The
 * empty remainder of the bar stays draggable. Account identity, rate limits, and the New session action
 * live in the rail, so this bar is just brand.
 */
export function GlobalHeader() {
  const isMac = isMacPlatform(window.api.platform);
  const isFullscreen = useFullscreen();
  useZoomFactor(isMac);
  return (
    <header
      className={cx(
        "drag-region flex shrink-0 select-none items-center overflow-hidden border-b border-ink-800 bg-ink-925 pr-4",
        isMac && "title-bar",
      )}
      style={{
        height: HEADER_HEIGHT_PX,
        paddingLeft: headerLeftPaddingPx(isMac, isFullscreen),
        transition: "padding-left 200ms ease-out",
      }}
    >
      <Wordmark />
    </header>
  );
}
