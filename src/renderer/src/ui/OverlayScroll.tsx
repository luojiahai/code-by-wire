import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cx } from "./atoms";
import { thumbMetrics, scrollTopForThumbTop } from "./overlay-scroll-metrics";

/** Idle delay after the last scroll before the thumb fades, when the pointer isn't inside (VSCode: 500ms). */
const HIDE_DELAY = 500;

/**
 * A scroll container with a VSCode-style overlay scrollbar. The thumb floats over the content (absolutely
 * positioned, so it reserves no layout width), appears while scrolling OR while the pointer is anywhere
 * inside the area, and fades out ~500ms after scrolling stops / the moment the pointer leaves. The thumb is
 * draggable. The native scrollbar is hidden via `.overlay-scroll-area`; the thumb geometry is the unit-tested
 * `overlay-scroll-metrics`. Visibility/active state ride on data-attributes so CSS owns the fade timing
 * (100ms in, 800ms out) while the thumb's size/position are written imperatively to avoid per-scroll
 * re-renders.
 */
export function OverlayScroll({
  className,
  contentClassName,
  children,
}: {
  /** Classes for the outer wrapper — put the sizing/placement here (e.g. `min-h-0 flex-1`, `w-72 shrink-0`). */
  className?: string;
  /** Classes for the inner scrolling element — put padding and content layout here (e.g. `p-4 flex flex-col gap-4`). */
  contentClassName?: string;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInside = useRef(false);
  const dragging = useRef(false);
  const dragStart = useRef<{ y: number; top: number; thumbH: number } | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [active, setActive] = useState(false);

  // Size and place the thumb from the live scroll geometry. Written straight to the DOM (not React state)
  // so a scroll burst doesn't re-render the whole list.
  const layout = useCallback(() => {
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    if (!el || !thumb) return;
    const m = thumbMetrics(el.scrollTop, el.scrollHeight, el.clientHeight);
    setOverflow(m.overflow);
    if (m.overflow) {
      thumb.style.height = `${m.height}px`;
      thumb.style.transform = `translateY(${m.top}px)`;
    }
  }, []);

  const clearHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  // Arm the fade — but only when nothing is holding the thumb open (pointer inside or a drag in progress).
  const scheduleHide = useCallback(() => {
    clearHide();
    if (pointerInside.current || dragging.current) return;
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
    if (!dragging.current) setVisible(false);
  }, []);

  const onThumbPointerDown = useCallback((e: ReactPointerEvent) => {
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    if (!el || !thumb) return;
    e.preventDefault();
    dragging.current = true;
    setActive(true);
    thumb.setPointerCapture(e.pointerId);
    dragStart.current = {
      y: e.clientY,
      top: thumbMetrics(el.scrollTop, el.scrollHeight, el.clientHeight).top,
      thumbH: thumb.offsetHeight,
    };
  }, []);

  const onThumbPointerMove = useCallback((e: ReactPointerEvent) => {
    const el = scrollRef.current;
    const start = dragStart.current;
    if (!dragging.current || !el || !start) return;
    const dy = e.clientY - start.y;
    el.scrollTop = scrollTopForThumbTop(
      start.top + dy,
      start.thumbH,
      el.scrollHeight,
      el.clientHeight,
    );
    // setting scrollTop fires onScroll, which lays out the thumb and keeps it revealed.
  }, []);

  const endDrag = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      dragStart.current = null;
      setActive(false);
      thumbRef.current?.releasePointerCapture(e.pointerId);
      if (pointerInside.current) scheduleHide();
      else setVisible(false);
    },
    [scheduleHide],
  );

  // Re-measure on container resize. Content-height changes (sessions added, groups toggled) re-render this
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
      className={cx("relative", className)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cx(
          "h-full overflow-y-auto overlay-scroll-area",
          contentClassName,
        )}
      >
        {children}
      </div>
      <div
        ref={thumbRef}
        className="overlay-scroll-thumb"
        data-visible={visible && overflow ? "true" : "false"}
        data-active={active ? "true" : "false"}
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  );
}
