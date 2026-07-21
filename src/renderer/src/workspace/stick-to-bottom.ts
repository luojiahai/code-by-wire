/** Scroll geometry for the transcript feed's follow rule, kept JSX-free so it's unit-testable. */

/** Slack in px below which the viewport still counts as "at the bottom": sub-pixel rounding, a fractional
 *  last line, and a nudge of the wheel shouldn't be read as "the user scrolled away". */
export const BOTTOM_EPSILON = 24;

/** Whether the viewport is parked at (or within `epsilon` of) the bottom — the condition for following
 *  newly arrived events. A container that doesn't overflow is trivially pinned. */
export function isPinnedToBottom(
  m: ScrollBox,
  epsilon: number = BOTTOM_EPSILON,
): boolean {
  return m.scrollHeight - m.clientHeight - m.scrollTop <= epsilon;
}

/** The slice of a scrolling element this logic reads and writes — a real DOM element satisfies it, and so
 *  does a plain object in the tests. */
export type ScrollBox = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
};

/**
 * The transcript feed's follow rule as a plain state machine, driven by the hook that owns the DOM
 * listeners (see use-stick-to-bottom). Two pieces of state:
 *
 * - `opened` — the one-shot landing at the bottom when the view is first opened, deferred until there's
 *   something to land on.
 * - `pinned` — whether the reader is still parked at the bottom, i.e. whether the feed should follow.
 *   Read from geometry on real scrolls only; a jump we performed ourselves asserts it directly.
 *
 * The jump guard matters: writing `scrollTop` dispatches a `scroll` event later, during the next
 * rendering update. If late layout (an image, KaTeX, streamed text) grows the content in that window,
 * reading pinned-ness from that stale event would unpin a reader who never touched the wheel. So the
 * first scroll after a jump is skipped, and the owner clears the guard on the next frame — after the
 * browser's scroll steps, so a genuine user scroll is never swallowed for longer than that frame.
 */
export class BottomFollower {
  private pinned = true;
  private opened = false;
  private guardJumpScroll = false;

  constructor(private readonly box: ScrollBox) {}

  /** Whether the feed is currently following. Exposed for tests and debugging. */
  get isPinned(): boolean {
    return this.pinned;
  }

  /** The one-shot open jump. No-op until the first events land — an empty feed has no bottom worth
   *  jumping to — and no-op ever after. Returns whether it jumped. */
  open(count: number): boolean {
    if (this.opened || count === 0) return false;
    this.opened = true;
    this.jump();
    return true;
  }

  /** Follow, if the reader is still parked at the bottom. Called both when new events commit and when the
   *  content or viewport resizes — late layout, streamed text and the Waiting banner all grow the feed
   *  without changing the event count. */
  followIfPinned(): boolean {
    if (!this.pinned) return false;
    this.jump();
    return true;
  }

  /** A `scroll` event on the container: re-read whether the reader is at the bottom, unless this is the
   *  echo of our own jump. */
  handleScroll(): void {
    if (this.guardJumpScroll) {
      this.guardJumpScroll = false;
      return;
    }
    this.pinned = isPinnedToBottom(this.box);
  }

  /** Drop the jump guard — call on the frame after a jump, so a scroll that never fired (the container was
   *  already at the bottom) can't swallow the reader's next one. */
  endJumpGuard(): void {
    this.guardJumpScroll = false;
  }

  private jump(): void {
    this.guardJumpScroll = true;
    // Over-large on purpose: the browser clamps to the true maximum, which saves reading clientHeight.
    this.box.scrollTop = this.box.scrollHeight;
    this.pinned = true;
  }
}
