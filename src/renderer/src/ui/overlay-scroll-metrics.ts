/**
 * Pure geometry for the VSCode-style overlay scrollbar. Kept JSX-free so the node tsconfig (Vitest) can
 * unit-test it. The component (OverlayScroll.tsx) is a thin shell that wires these to scroll/pointer events.
 *
 * Mirrors VSCode's ScrollbarState math: the thumb size is the viewport's share of the content, clamped to a
 * minimum so it stays grabbable, and the thumb travels the leftover track in proportion to scrollTop.
 */

/** The minimum thumb length, so a very long list still leaves something to grab (VSCode uses 20px). */
export const MIN_THUMB = 20;

export interface ThumbMetrics {
  /** Thumb length along the scroll axis in px — height for a vertical bar, width for a horizontal
   *  one (0 when there's nothing to scroll). */
  height: number;
  /** Thumb offset from the start of the track in px — top for vertical, left for horizontal. */
  top: number;
  /** Whether the content overflows — i.e. whether a thumb should show at all. */
  overflow: boolean;
}

/** Thumb length + position for the current scroll state. Axis-agnostic: pass scrollTop/scrollHeight/
 *  clientHeight for a vertical bar, scrollLeft/scrollWidth/clientWidth for a horizontal one.
 *  `trackLength` is the room the thumb travels in — it defaults to the viewport length and is
 *  shortened by the other bar's thickness when both axes show (corner reservation).
 *  `top` ranges 0..(trackLength - height). */
export function thumbMetrics(
  scrollOffset: number,
  contentLength: number,
  viewportLength: number,
  trackLength: number = viewportLength,
  minThumb: number = MIN_THUMB,
): ThumbMetrics {
  if (
    viewportLength <= 0 ||
    trackLength <= 0 ||
    contentLength <= viewportLength
  ) {
    return { height: 0, top: 0, overflow: false };
  }
  const height = Math.min(
    trackLength,
    Math.max(
      minThumb,
      Math.round((trackLength * viewportLength) / contentLength),
    ),
  );
  const maxScroll = contentLength - viewportLength;
  const maxTop = trackLength - height;
  const top =
    maxScroll <= 0 ? 0 : Math.round((scrollOffset / maxScroll) * maxTop);
  return { height, top, overflow: true };
}

/** Inverse of `thumbMetrics`: the scroll offset that places a thumb of `thumbLength` at `thumbTop`.
 *  Used while dragging — the pointer moves the thumb, this maps it back to a scroll position.
 *  Clamps to the track. Axis-agnostic, same substitution as `thumbMetrics`. */
export function scrollTopForThumbTop(
  thumbTop: number,
  thumbLength: number,
  contentLength: number,
  viewportLength: number,
  trackLength: number = viewportLength,
): number {
  const maxTop = trackLength - thumbLength;
  const maxScroll = contentLength - viewportLength;
  if (maxTop <= 0 || maxScroll <= 0) return 0;
  const clamped = Math.min(Math.max(thumbTop, 0), maxTop);
  return (clamped / maxTop) * maxScroll;
}
