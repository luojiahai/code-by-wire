/** Scroll geometry for the transcript feed's follow rule, kept JSX-free so it's unit-testable. */

/** Slack in px below which the viewport still counts as "at the bottom": sub-pixel rounding, a fractional
 *  last line, and a nudge of the wheel shouldn't be read as "the user scrolled away". */
export const BOTTOM_EPSILON = 24;

/** Whether the viewport is parked at (or within `epsilon` of) the bottom — the condition for following
 *  newly arrived events. A container that doesn't overflow is trivially pinned. */
export function isPinnedToBottom(
  m: { scrollTop: number; clientHeight: number; scrollHeight: number },
  epsilon: number = BOTTOM_EPSILON,
): boolean {
  return m.scrollHeight - m.clientHeight - m.scrollTop <= epsilon;
}
