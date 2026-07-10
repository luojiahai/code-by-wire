import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type ReactNode,
} from "react";
import { cx } from "./atoms";
import { thumbMetrics, scrollTopForThumbTop } from "./overlay-scroll-metrics";

/** Idle delay after the last scroll before the thumbs fade, when the pointer isn't inside (VSCode: 500ms). */
const HIDE_DELAY = 500;

/** Thumb thickness in px — keep in sync with .overlay-scroll-thumb / .overlay-scroll-thumb-x (index.css). */
const BAR_SIZE = 10;

type Axis = "x" | "y";

/** When both axes overflow (axis="both"), each track is shortened by the other bar's thickness so the
 *  thumbs never overlap in the bottom-right corner (VSCode's corner reservation). */
function cornerInset(el: HTMLElement, axis: "y" | "both"): number {
  return axis === "both" &&
    el.scrollHeight > el.clientHeight &&
    el.scrollWidth > el.clientWidth
    ? BAR_SIZE
    : 0;
}

/**
 * A scroll container with a VSCode-style overlay scrollbar. The thumbs float over the content (absolutely
 * positioned, so they reserve no layout space), appear while scrolling OR while the pointer is anywhere
 * inside the area, and fade out ~500ms after scrolling stops / the moment the pointer leaves. Thumbs are
 * draggable. The native scrollbar is hidden via `.overlay-scroll-area`; the thumb geometry is the
 * unit-tested `overlay-scroll-metrics`. Visibility/active state ride on data-attributes so CSS owns the
 * fade timing (100ms in, 800ms out) while thumb size/position are written imperatively to avoid
 * per-scroll re-renders. `axis="both"` adds horizontal scrolling with a second thumb along the bottom
 * edge; visibility is shared (either axis' scroll or entering the area reveals both), but each thumb
 * renders only when its own axis overflows.
 */
export function OverlayScroll({
  className,
  contentClassName,
  axis = "y",
  children,
}: {
  /** Classes for the outer wrapper — put the sizing/placement here (e.g. `min-h-0 flex-1`, `w-72 shrink-0`).
   *  For a content-sized box (modal bodies), leave the wrapper unsized and cap `contentClassName` instead. */
  className?: string;
  /** Classes for the inner scrolling element — put padding and content layout here (e.g. `p-4 flex flex-col
   *  gap-4`). For content-sized boxes put the height cap here too (e.g. `max-h-[60vh]`): the wrapper
   *  shrink-wraps the scroll element (the built-in `h-full` resolves to auto against an unsized wrapper). */
  contentClassName?: string;
  /** "y" (default): vertical scrolling only. "both": horizontal scrolling + a bottom thumb as well. */
  axis?: "y" | "both";
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbYRef = useRef<HTMLDivElement>(null);
  const thumbXRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInside = useRef(false);
  const draggingAxis = useRef<Axis | null>(null);
  const dragStart = useRef<{
    pos: number;
    lead: number;
    thumbLen: number;
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const [overflowY, setOverflowY] = useState(false);
  const [overflowX, setOverflowX] = useState(false);
  const [activeAxis, setActiveAxis] = useState<Axis | null>(null);

  // Size and place the thumbs from the live scroll geometry. Written straight to the DOM (not React
  // state) so a scroll burst doesn't re-render the whole list.
  const layout = useCallback(() => {
    const el = scrollRef.current;
    const thumbY = thumbYRef.current;
    if (!el || !thumbY) return;
    const inset = cornerInset(el, axis);
    const my = thumbMetrics(
      el.scrollTop,
      el.scrollHeight,
      el.clientHeight,
      el.clientHeight - inset,
    );
    setOverflowY(my.overflow);
    if (my.overflow) {
      thumbY.style.height = `${my.height}px`;
      thumbY.style.transform = `translateY(${my.top}px)`;
    }
    const thumbX = thumbXRef.current;
    if (axis === "both" && thumbX) {
      const mx = thumbMetrics(
        el.scrollLeft,
        el.scrollWidth,
        el.clientWidth,
        el.clientWidth - inset,
      );
      setOverflowX(mx.overflow);
      if (mx.overflow) {
        thumbX.style.width = `${mx.height}px`;
        thumbX.style.transform = `translateX(${mx.top}px)`;
      }
    }
  }, [axis]);

  const clearHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  // Arm the fade — but only when nothing is holding the thumbs open (pointer inside or a drag in progress).
  const scheduleHide = useCallback(() => {
    clearHide();
    if (pointerInside.current || draggingAxis.current) return;
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY);
  }, [clearHide]);

  const onScroll = useCallback(() => {
    layout();
    setVisible(true);
    scheduleHide();
  }, [layout, scheduleHide]);

  const onPointerEnter = useCallback(() => {
    pointerInside.current = true;
    clearHide();
    setVisible(true);
  }, [clearHide]);

  const onPointerLeave = useCallback(() => {
    pointerInside.current = false;
    if (!draggingAxis.current) setVisible(false);
  }, []);

  const beginDrag = useCallback(
    (a: Axis, e: ReactPointerEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      e.preventDefault();
      draggingAxis.current = a;
      setActiveAxis(a);
      e.currentTarget.setPointerCapture(e.pointerId);
      const inset = cornerInset(el, axis);
      dragStart.current =
        a === "y"
          ? {
              pos: e.clientY,
              lead: thumbMetrics(
                el.scrollTop,
                el.scrollHeight,
                el.clientHeight,
                el.clientHeight - inset,
              ).top,
              thumbLen: e.currentTarget.offsetHeight,
            }
          : {
              pos: e.clientX,
              lead: thumbMetrics(
                el.scrollLeft,
                el.scrollWidth,
                el.clientWidth,
                el.clientWidth - inset,
              ).top,
              thumbLen: e.currentTarget.offsetWidth,
            };
    },
    [axis],
  );

  const onThumbPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const el = scrollRef.current;
      const start = dragStart.current;
      const a = draggingAxis.current;
      if (!a || !el || !start) return;
      const inset = cornerInset(el, axis);
      if (a === "y") {
        el.scrollTop = scrollTopForThumbTop(
          start.lead + (e.clientY - start.pos),
          start.thumbLen,
          el.scrollHeight,
          el.clientHeight,
          el.clientHeight - inset,
        );
      } else {
        el.scrollLeft = scrollTopForThumbTop(
          start.lead + (e.clientX - start.pos),
          start.thumbLen,
          el.scrollWidth,
          el.clientWidth,
          el.clientWidth - inset,
        );
      }
      // setting scrollTop/scrollLeft fires onScroll, which lays out the thumbs and keeps them revealed.
    },
    [axis],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingAxis.current) return;
      draggingAxis.current = null;
      dragStart.current = null;
      setActiveAxis(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (pointerInside.current) scheduleHide();
      else setVisible(false);
    },
    [scheduleHide],
  );

  // The thumbs overlay the content with pointer-events:auto, so a wheel landing on one would otherwise
  // hit a non-scrollable element (its only ancestor is the overflow-hidden wrapper). Forward the deltas
  // to the scroll element so the wheel keeps scrolling the list even with the cursor on a bar.
  const onThumbWheel = useCallback((e: ReactWheelEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop += e.deltaY;
    el.scrollLeft += e.deltaX;
  }, []);

  // Re-measure on container resize. Content-size changes (sessions added, groups toggled) re-render this
  // component, and the layout-every-render effect below catches those.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => layout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout]);

  useEffect(() => {
    layout();
  });

  useEffect(() => clearHide, [clearHide]);

  return (
    <div
      // overflow-hidden (like VSCode's .monaco-scrollable-element) clips the absolutely-positioned thumbs
      // to this box, so at the scroll boundary they can't contribute to the document's overflow and flash
      // the global page scrollbar.
      className={cx("relative overflow-hidden", className)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cx(
          "h-full overflow-y-auto overlay-scroll-area",
          axis === "both" && "overflow-x-auto",
          contentClassName,
        )}
      >
        {children}
      </div>
      <div
        ref={thumbYRef}
        className="overlay-scroll-thumb"
        data-visible={visible && overflowY ? "true" : "false"}
        data-active={activeAxis === "y" ? "true" : "false"}
        onPointerDown={(e) => beginDrag("y", e)}
        onPointerMove={onThumbPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onThumbWheel}
      />
      {axis === "both" && (
        <div
          ref={thumbXRef}
          className="overlay-scroll-thumb-x"
          data-visible={visible && overflowX ? "true" : "false"}
          data-active={activeAxis === "x" ? "true" : "false"}
          onPointerDown={(e) => beginDrag("x", e)}
          onPointerMove={onThumbPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={onThumbWheel}
        />
      )}
    </div>
  );
}
