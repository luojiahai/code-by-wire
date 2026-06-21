import type { CliStatus } from "@shared/cli-status";
import { Wordmark, cx } from "./atoms";
import { Icon } from "./icons";
import { footerView, type FooterView } from "./rail-footer";
import { useZoomFactor } from "./use-zoom-factor";
import { useFullscreen } from "./use-fullscreen";
import { HEADER_HEIGHT_PX, headerLeftPaddingPx } from "@shared/chrome";
import { isMacPlatform } from "@shared/platform";

// The master-caution badge hue, shown on the Settings gear only when the CLI trips: amber warn, red error.
const BADGE_CLASS: Partial<Record<FooterView["dot"], string>> = {
  warn: "bg-accent",
  error: "bg-danger",
};

/**
 * The frameless app's title bar: a draggable strip carrying the wordmark (anchored top-left) and the
 * Settings gear (anchored top-right). On macOS the wordmark sits past the native traffic lights when
 * windowed; in fullscreen the lights are gone, so its left inset drops and it slides into the corner
 * (see `headerLeftPaddingPx`). The `title-bar` class counter-zooms so the bar holds a fixed physical
 * size while the rest of the window zooms. The empty remainder stays draggable; the gear opts back out
 * (`no-drag`) so it stays clickable.
 *
 * Claude Code CLI health rides on the gear as a master-caution badge: dark when the CLI is ready, an
 * amber/red pulsing dot when it's outdated, logged out, or missing. Clicking opens Settings, where the
 * System / CLI status detail lives; the tooltip carries the status text.
 */
export function GlobalHeader({
  cliStatus,
  onOpenSettings,
  settingsActive,
}: {
  cliStatus: CliStatus | null;
  onOpenSettings: () => void;
  settingsActive: boolean;
}) {
  const isMac = isMacPlatform(window.api.platform);
  const isFullscreen = useFullscreen();
  useZoomFactor(isMac);
  const v = footerView(cliStatus);
  const trips = v.dot === "warn" || v.dot === "error";
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
      <div className="no-drag ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title={trips ? `Settings · ${v.statusLabel}` : "Settings"}
          className={cx(
            "relative inline-flex items-center justify-center rounded-md border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
            settingsActive
              ? "border-ink-700 bg-ink-900 text-fg"
              : "border-ink-800 text-fg-faint hover:border-ink-700 hover:text-fg-muted",
          )}
        >
          <Icon name="settings" size={15} />
          {trips && (
            <span
              className={cx(
                "absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-ink-925 animate-pulse-soft",
                BADGE_CLASS[v.dot],
              )}
            />
          )}
        </button>
      </div>
    </header>
  );
}
