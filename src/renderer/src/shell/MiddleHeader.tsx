import type { ReactNode } from "react";
import type { Session } from "@shared/types";
import { headerLeftPaddingPx } from "@shared/chrome";
import { isMacPlatform } from "@shared/platform";
import { cx, focusRing } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { useFullscreen } from "../ui/use-fullscreen";

/**
 * The middle column's own in-column header (design spec §5): a draggable strip that carries the
 * active session's menu — name, chevron, and Managed/Observed badge, all bundled in Task 7's
 * `SessionMenu` and passed in as `menu` — or a plain title when there's no session, plus a
 * Transcript on/off switch and the reopen buttons for either sidebar when it's collapsed. Standalone
 * for now; Task 8/11 wire it into `Workspace.tsx`/`App.tsx` above the terminal/transcript view.
 *
 * Left padding is its own case, distinct from `GlobalHeader`: when the left sidebar is expanded its
 * own top bar already reserves the traffic-light inset, so this header only needs a small fixed
 * padding; when the left sidebar is collapsed, this header becomes the visual left edge and must
 * reserve the same inset the sidebar's top bar would have.
 */
export function MiddleHeader({
  title,
  session,
  transcriptOn,
  onToggleTranscript,
  leftCollapsed,
  onShowLeft,
  rightCollapsed,
  onShowRight,
  menu,
}: {
  title: string;
  session: Session | null;
  transcriptOn: boolean;
  onToggleTranscript: () => void;
  leftCollapsed: boolean;
  onShowLeft: () => void;
  rightCollapsed: boolean;
  onShowRight: () => void;
  menu: ReactNode;
}) {
  const isMac = isMacPlatform(window.api.platform);
  const isFullscreen = useFullscreen();
  const paddingLeft = leftCollapsed
    ? headerLeftPaddingPx(isMac, isFullscreen)
    : 14;

  return (
    <header
      className={cx(
        "drag-region flex shrink-0 select-none items-center overflow-hidden border-b border-ink-800 bg-ink-925 pr-4",
        isMac && "title-bar",
      )}
      style={{
        height: "var(--titlebar-height)",
        paddingLeft,
        transition: "padding-left 200ms ease-out",
      }}
    >
      {leftCollapsed && (
        <button
          type="button"
          onClick={onShowLeft}
          aria-label="Show sidebar"
          title="Show sidebar"
          className={cx(
            "no-drag mr-2 inline-flex items-center justify-center rounded p-1.5 text-fg-faint transition-colors hover:text-fg-muted",
            focusRing,
          )}
        >
          <Icon name="panel-left-open" size={15} />
        </button>
      )}
      {session ? (
        menu
      ) : (
        <span className="truncate text-body text-fg">{title}</span>
      )}
      <div className="no-drag ml-auto flex items-center gap-2">
        {session && (
          <button
            type="button"
            role="switch"
            aria-checked={transcriptOn}
            onClick={onToggleTranscript}
            aria-label="Toggle transcript"
            title="Transcript"
            className={cx(
              "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
              transcriptOn ? "bg-primary" : "bg-ink-700",
            )}
          >
            <span
              className={cx(
                "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all",
                transcriptOn ? "right-[2px]" : "left-[2px]",
              )}
            />
          </button>
        )}
        {rightCollapsed && session && (
          <button
            type="button"
            onClick={onShowRight}
            aria-label="Show right panel"
            title="Show right panel"
            className={cx(
              "inline-flex items-center justify-center rounded p-1.5 text-fg-faint transition-colors hover:text-fg-muted",
              focusRing,
            )}
          >
            <Icon name="panel-right-open" size={15} />
          </button>
        )}
      </div>
    </header>
  );
}
