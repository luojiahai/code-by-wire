import { useStore } from "@nanostores/react";
import { isMacPlatform } from "@shared/platform";
import { Icon } from "../ui/icons";
import { useFullscreen } from "../ui/use-fullscreen";
import { $paneOpen, togglePane } from "./panes";
import { CBW_LEFT_PANE_ID, CBW_RIGHT_PANE_ID } from "./layout";
import {
  TITLEBAR_CONTROL_WIDTH,
  TITLEBAR_CONTROL_HEIGHT,
  TITLEBAR_CONTROLS_TOP,
  TITLEBAR_EDGE_INSET,
  titlebarControlsLeftPx,
} from "./titlebar";

/**
 * The fixed sidebar-toggle clusters (ported from hermes-agent's titlebar-controls): always-visible
 * buttons pinned to the window's top corners, OUTSIDE the panes and the header flex row, so hiding
 * a sidebar never means clicking a control inside the thing being hidden, and nothing in the header
 * mounts/unmounts on toggle. Each button flips the stored pane preference with no narrow-viewport
 * branch (hermes behavior): while a narrow window force-collapses the panes, the click's effect
 * becomes visible when the window widens; hover-reveal is the narrow-mode affordance.
 *
 * Fixed positioning only takes this component out of layout flow, not out of DOM order for
 * Chromium's draggable-region computation: that region is built by walking the tree in DOM order,
 * unioning `drag` rects and subtracting `no-drag` rects as it goes. So this component must be
 * mounted AFTER every `drag-region` element it visually overlaps (the sidebars' top strips,
 * MiddleHeader's drag strip) — mounting it earlier lets those later drag unions swallow its
 * no-drag subtraction back up, making the buttons undraggable-looking but actually click-through
 * to a window drag.
 *
 * `data-suppress-pane-reveal` makes the edge triggers pointer-transparent while a cluster is
 * hovered (see index.css) — the left cluster overlaps the left trigger strip whenever it sits at
 * the bare 14px edge inset (non-mac, or macOS fullscreen).
 */
export function TitlebarControls({ hasSession }: { hasSession: boolean }) {
  const isMac = isMacPlatform(window.api.platform);
  const isFullscreen = useFullscreen();
  const leftOpen = useStore($paneOpen(CBW_LEFT_PANE_ID));
  const rightOpen = useStore($paneOpen(CBW_RIGHT_PANE_ID));

  return (
    <>
      <div
        className="no-drag fixed z-40 flex select-none items-center gap-x-1 translate-y-0.5"
        data-suppress-pane-reveal=""
        style={{
          left: titlebarControlsLeftPx(isMac, isFullscreen),
          top: TITLEBAR_CONTROLS_TOP,
        }}
      >
        <TitlebarToolButton
          icon="panel-left"
          label={leftOpen ? "Hide sidebar" : "Show sidebar"}
          onSelect={() => togglePane(CBW_LEFT_PANE_ID)}
        />
      </div>
      {hasSession && (
        <div
          className="no-drag fixed z-40 flex select-none items-center gap-x-1"
          data-suppress-pane-reveal=""
          style={{ right: TITLEBAR_EDGE_INSET, top: TITLEBAR_CONTROLS_TOP }}
        >
          <TitlebarToolButton
            icon="panel-right"
            label={rightOpen ? "Hide right panel" : "Show right panel"}
            onSelect={() => togglePane(CBW_RIGHT_PANE_ID)}
          />
        </div>
      )}
    </>
  );
}

/** One cluster button. No active-state background — a plain show/hide affordance whose state
 *  reads from the tooltip/aria-label (hermes convention). */
function TitlebarToolButton({
  icon,
  label,
  onSelect,
}: {
  icon: "panel-left" | "panel-right";
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onSelect}
      className="inline-flex items-center justify-center rounded-[4px] text-(--ui-text-secondary)/85 transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-fg hover:transition-none"
      style={{ height: TITLEBAR_CONTROL_HEIGHT, width: TITLEBAR_CONTROL_WIDTH }}
    >
      {/* 16, not hermes's 14: hermes renders codicons, whose artwork fills ~the full em; lucide
          keeps 25% internal padding, so lucide-16 ≈ codicon-14 in visible glyph size. */}
      <Icon name={icon} size={16} />
    </button>
  );
}
