/**
 * The DOM `scrollTop` that realigns xterm's scrollable viewport with its internal scroll position
 * (`viewportY`, the buffer line drawn at the top). xterm's scroll-area height is proportional to the
 * total buffer line count, so `viewportY / length` of that height lands exactly on `viewportY * rowHeight`
 * — where the renderer already sits. At the bottom this resolves to the maximum scroll, so a session that
 * was tailing output stays pinned to the bottom.
 *
 * Why it exists: detaching the terminal wrapper on a tab switch resets the DOM `scrollTop` to 0 while
 * xterm keeps its `viewportY`. The render still follows `viewportY` (looks fine), but the first wheel tick
 * feeds the stale `scrollTop` back into xterm as `round(0 / rowHeight) - viewportY` and snaps the view to
 * the top. Re-deriving `scrollTop` from `viewportY` on re-attach closes that gap. Returns 0 for an empty
 * buffer (no rows, nothing to scroll).
 */
export function viewportScrollTop(
  viewportY: number,
  length: number,
  scrollHeight: number,
): number {
  if (length <= 0) return 0;
  return Math.round((viewportY / length) * scrollHeight);
}
