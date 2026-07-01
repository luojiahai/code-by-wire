import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useStore } from "@nanostores/react";
import { cx } from "../ui/atoms";
import {
  $paneStates,
  ensurePaneRegistered,
  setPaneWidthOverride,
} from "./panes";
import { PaneShellContext, type PaneSide } from "./pane-shell-context";

const HOVER_REVEAL_SLIDE_MS = 220;
const HOVER_REVEAL_ENTER_DELAY_MS = 130;
const HOVER_REVEAL_EASE = "cubic-bezier(0.32,0.72,0,1)";
const HOVER_REVEAL_SHADOW = "0px -18px 18px -5px #00000012";
const HOVER_REVEAL_TRIGGER_WIDTH = 14;
const HOVER_REVEAL_EDGE_GUTTER = "calc(0.5rem + 2px)";

export interface PaneProps {
  id: string;
  side: PaneSide;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  hoverReveal?: boolean;
  disabled?: boolean;
  divider?: boolean;
  defaultOpen?: boolean;
  overlayWidth?: number;
  onOverlayActiveChange?: (active: boolean) => void;
  children?: ReactNode;
}

export function Pane({
  id,
  side,
  width = 248,
  minWidth = 200,
  maxWidth = 360,
  resizable = true,
  hoverReveal = false,
  disabled = false,
  divider = true,
  defaultOpen = true,
  overlayWidth,
  onOverlayActiveChange,
  children,
}: PaneProps) {
  const ctx = useContext(PaneShellContext);
  useStore($paneStates);
  const registered = useRef(false);
  const paneRef = useRef<HTMLDivElement | null>(null);

  const slot = ctx?.paneById.get(id);
  const open = Boolean(slot?.open) && !disabled;
  const overlayActive = !open && hoverReveal && !disabled;
  const canResize = resizable && open;

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    ensurePaneRegistered(id, { open: defaultOpen });
  }, [defaultOpen, id]);

  useEffect(() => {
    onOverlayActiveChange?.(overlayActive);
  }, [onOverlayActiveChange, overlayActive]);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const base = paneRef.current?.getBoundingClientRect().width ?? 0;
      if (!canResize || base <= 0) return;
      event.preventDefault();
      const handle = event.currentTarget;
      const { pointerId } = event;
      const start = event.clientX;
      const dir = side === "left" ? 1 : -1;
      const restoreCursor = document.body.style.cursor;
      const restoreSelect = document.body.style.userSelect;
      handle.setPointerCapture?.(pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (e: PointerEvent) => {
        const next = base + (e.clientX - start) * dir;
        setPaneWidthOverride(
          id,
          Math.round(Math.min(maxWidth, Math.max(minWidth, next))),
        );
      };
      const cleanup = () => {
        document.body.style.cursor = restoreCursor;
        document.body.style.userSelect = restoreSelect;
        handle.releasePointerCapture?.(pointerId);
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", cleanup, true);
        window.removeEventListener("pointercancel", cleanup, true);
        window.removeEventListener("blur", cleanup);
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", cleanup, true);
      window.addEventListener("pointercancel", cleanup, true);
      window.addEventListener("blur", cleanup);
    },
    [canResize, id, maxWidth, minWidth, side],
  );

  if (overlayActive) {
    const edge = side === "left" ? "left" : "right";
    const offscreen =
      side === "left"
        ? "-translate-x-[calc(100%+1rem)]"
        : "translate-x-[calc(100%+1rem)]";
    return (
      <div
        className="group/reveal pointer-events-none relative min-w-0"
        ref={paneRef}
        style={{ gridColumn: slot?.gridColumn }}
      >
        <div
          aria-hidden
          className="pointer-events-auto absolute inset-y-0 z-30 [-webkit-app-region:no-drag]"
          style={{
            [edge]: HOVER_REVEAL_EDGE_GUTTER,
            width: HOVER_REVEAL_TRIGGER_WIDTH,
          }}
        />
        <div
          className={cx(
            "pointer-events-none absolute inset-y-0 z-30 overflow-hidden transition-transform",
            offscreen,
            "group-hover/reveal:pointer-events-auto group-hover/reveal:translate-x-0 group-hover/reveal:delay-[var(--reveal-enter-delay)] group-hover/reveal:shadow-[var(--reveal-shadow)]",
          )}
          style={
            {
              [edge]: 0,
              width: overlayWidth ?? width,
              "--reveal-shadow": HOVER_REVEAL_SHADOW,
              transitionDuration: `${HOVER_REVEAL_SLIDE_MS}ms`,
              transitionTimingFunction: HOVER_REVEAL_EASE,
              "--reveal-enter-delay": `${HOVER_REVEAL_ENTER_DELAY_MS}ms`,
            } as CSSProperties
          }
        >
          <div className="flex h-full w-full flex-col">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx(
        "relative min-h-0 min-w-0 overflow-hidden",
        !open && "pointer-events-none",
      )}
      aria-hidden={!open}
      ref={paneRef}
      style={{ gridColumn: slot?.gridColumn }}
    >
      {canResize && (
        <div
          aria-label={`Resize ${id}`}
          role="separator"
          tabIndex={0}
          onPointerDown={startResize}
          className={cx(
            "group absolute bottom-0 top-0 z-20 w-1 cursor-col-resize [-webkit-app-region:no-drag]",
            side === "left"
              ? "right-0 translate-x-1/2"
              : "left-0 -translate-x-1/2",
          )}
        >
          {divider && (
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink-800" />
          )}
          <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-primary/40 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100" />
        </div>
      )}
      {open && children}
    </div>
  );
}
