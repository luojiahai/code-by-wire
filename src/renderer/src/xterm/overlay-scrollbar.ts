import type { Terminal } from "@xterm/xterm";
import {
  thumbMetrics,
  scrollTopForThumbTop,
} from "../ui/overlay-scroll-metrics";

/** Idle after the last scroll before the thumb fades, when the pointer isn't over the terminal (VSCode: 500ms). */
const SCROLLBAR_HIDE_DELAY = 500;

/**
 * Attach a VSCode-style overlay scrollbar to the terminal. VSCode's terminal scrollbar IS xterm.js's own
 * ScrollableElement widget (enabled via the `scrollbar` option + `theme.scrollbarSlider*`), which our
 * @xterm/xterm 5.5.0 doesn't expose — so we reproduce its design: a thumb floating over the viewport's
 * right strip that reveals on scroll and while the pointer is over the terminal, fades after an idle beat,
 * and is draggable. Shares the app's `overlay-scroll-metrics` math and `.overlay-scroll-thumb` styling
 * (VSCode's slider greys, 100ms-in/800ms-out fade) so the terminal reads the same as every other scroll
 * area. The native viewport scrollbar stays (transparent, see index.css) only to reserve the strip; this
 * thumb is the visible one. Lives in this post-open seam beside the WebGL wiring; returns a teardown for
 * the wrapped `term.dispose` so a disposed terminal leaves no listeners or timer on the detached viewport. */
export function attachOverlayScrollbar(
  parent: HTMLElement,
  term: Terminal,
): () => void {
  const viewport = parent.querySelector(".xterm-viewport");
  if (!(viewport instanceof HTMLElement)) return () => {};

  const thumb = document.createElement("div");
  // Width comes from the shared .overlay-scroll-thumb class (10px), so it matches every other scroll area.
  thumb.className = "overlay-scroll-thumb";
  thumb.dataset.visible = "false";
  parent.appendChild(thumb);

  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let pointerInside = false;
  let dragging = false;
  let dragStartY = 0;
  let dragStartTop = 0;
  let dragThumbH = 0;

  // Size and place the thumb from the viewport's live scroll geometry. Returns whether there's overflow.
  const layout = (): boolean => {
    const m = thumbMetrics(
      viewport.scrollTop,
      viewport.scrollHeight,
      viewport.clientHeight,
    );
    if (!m.overflow) {
      thumb.dataset.visible = "false";
      return false;
    }
    thumb.style.height = `${m.height}px`;
    thumb.style.transform = `translateY(${m.top}px)`;
    // Pointer-inside and drag never auto-fade (scheduleHide skips them), so when output grows the content
    // past one screen while the pointer rests in the terminal, reveal the thumb here — otherwise it'd stay
    // hidden until the next scroll or re-enter. Mirrors OverlayScroll's `data-visible = visible && overflow`.
    if (pointerInside || dragging) thumb.dataset.visible = "true";
    return true;
  };

  const clearHide = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    }
  };
  const scheduleHide = () => {
    clearHide();
    if (pointerInside || dragging) return;
    hideTimer = setTimeout(() => {
      thumb.dataset.visible = "false";
    }, SCROLLBAR_HIDE_DELAY);
  };
  const reveal = () => {
    if (!layout()) return;
    thumb.dataset.visible = "true";
    scheduleHide();
  };

  const onScroll = () => reveal();
  const onPointerEnter = () => {
    pointerInside = true;
    clearHide();
    if (layout()) thumb.dataset.visible = "true";
  };
  const onPointerLeave = () => {
    pointerInside = false;
    if (!dragging) thumb.dataset.visible = "false";
  };
  const onThumbDown = (e: PointerEvent) => {
    e.preventDefault();
    dragging = true;
    thumb.dataset.active = "true";
    thumb.setPointerCapture(e.pointerId);
    dragStartY = e.clientY;
    dragStartTop = thumbMetrics(
      viewport.scrollTop,
      viewport.scrollHeight,
      viewport.clientHeight,
    ).top;
    dragThumbH = thumb.offsetHeight;
  };
  const onThumbMove = (e: PointerEvent) => {
    if (!dragging) return;
    viewport.scrollTop = scrollTopForThumbTop(
      dragStartTop + (e.clientY - dragStartY),
      dragThumbH,
      viewport.scrollHeight,
      viewport.clientHeight,
    );
    // setting scrollTop fires onScroll, which lays out the thumb and keeps it revealed.
  };
  const onThumbUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    thumb.dataset.active = "false";
    thumb.releasePointerCapture(e.pointerId);
    if (pointerInside) scheduleHide();
    else thumb.dataset.visible = "false";
  };
  // The thumb sits over the viewport's reserved strip with pointer-events:auto, so a wheel landing on it
  // would otherwise hit a non-scrollable element and stall. Forward the delta to the viewport (xterm syncs
  // off the resulting 'scroll' event) so the wheel keeps scrolling even with the cursor on the bar.
  const onThumbWheel = (e: WheelEvent) => {
    viewport.scrollTop += e.deltaY;
  };

  viewport.addEventListener("scroll", onScroll);
  parent.addEventListener("pointerenter", onPointerEnter);
  parent.addEventListener("pointerleave", onPointerLeave);
  thumb.addEventListener("pointerdown", onThumbDown);
  thumb.addEventListener("pointermove", onThumbMove);
  thumb.addEventListener("pointerup", onThumbUp);
  thumb.addEventListener("pointercancel", onThumbUp);
  thumb.addEventListener("wheel", onThumbWheel, { passive: true });
  // Re-measure when xterm repaints (scrollback growth) or resizes — the viewport geometry shifts in those
  // cases without firing a DOM 'scroll' event. onRender fires on EVERY repaint (cursor blink, spinner,
  // in-place redraws), so gate the relayout on the buffer line count — a cheap JS read — to skip the layout
  // reflow on frames where scrollHeight can't have changed. Scroll-position changes are already caught by
  // the 'scroll' listener; resizes by onResize.
  let lastBufferLength = -1;
  const relayoutOnGrowth = () => {
    const length = term.buffer.active.length;
    if (length === lastBufferLength) return;
    lastBufferLength = length;
    layout();
  };
  const render = term.onRender(relayoutOnGrowth);
  const resize = term.onResize(() => layout());
  layout();

  return () => {
    viewport.removeEventListener("scroll", onScroll);
    parent.removeEventListener("pointerenter", onPointerEnter);
    parent.removeEventListener("pointerleave", onPointerLeave);
    render.dispose();
    resize.dispose();
    clearHide();
    thumb.remove();
  };
}
