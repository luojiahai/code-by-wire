import { describe, expect, it } from "vitest";
import {
  BOTTOM_EPSILON,
  BottomFollower,
  isPinnedToBottom,
  type ScrollBox,
} from "../../../src/renderer/src/workspace/stick-to-bottom";

describe("isPinnedToBottom", () => {
  it("is pinned when scrolled exactly to the bottom", () => {
    expect(
      isPinnedToBottom({
        scrollTop: 600,
        clientHeight: 400,
        scrollHeight: 1000,
      }),
    ).toBe(true);
  });

  it("is pinned within the epsilon of slack", () => {
    expect(
      isPinnedToBottom({
        scrollTop: 600 - BOTTOM_EPSILON,
        clientHeight: 400,
        scrollHeight: 1000,
      }),
    ).toBe(true);
  });

  it("is not pinned once scrolled further up than the slack", () => {
    expect(
      isPinnedToBottom({
        scrollTop: 600 - BOTTOM_EPSILON - 1,
        clientHeight: 400,
        scrollHeight: 1000,
      }),
    ).toBe(false);
  });

  it("is not pinned when reading well up the feed", () => {
    expect(
      isPinnedToBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 1000 }),
    ).toBe(false);
  });

  it("is pinned when the content doesn't overflow", () => {
    expect(
      isPinnedToBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 300 }),
    ).toBe(true);
  });

  it("honours a custom epsilon", () => {
    const m = { scrollTop: 590, clientHeight: 400, scrollHeight: 1000 };
    expect(isPinnedToBottom(m, 5)).toBe(false);
    expect(isPinnedToBottom(m, 20)).toBe(true);
  });
});

/** A stand-in for the scrolling element: `scrollTop` clamps to the true maximum the way a real container
 *  does, so the follower's deliberately over-large write lands at the bottom rather than past it. */
function box(clientHeight = 400, scrollHeight = 1000): ScrollBox {
  let top = 0;
  return {
    clientHeight,
    scrollHeight,
    get scrollTop() {
      return top;
    },
    set scrollTop(v: number) {
      top = Math.max(0, Math.min(v, this.scrollHeight - this.clientHeight));
    },
  };
}

describe("BottomFollower", () => {
  it("lands at the bottom on open, once there are events", () => {
    const m = box();
    const f = new BottomFollower(m);
    expect(f.open(0)).toBe(false);
    expect(m.scrollTop).toBe(0);
    expect(f.open(3)).toBe(true);
    expect(m.scrollTop).toBe(600);
  });

  it("does not re-open after the one-shot", () => {
    const m = box();
    const f = new BottomFollower(m);
    f.open(3);
    m.scrollTop = 0;
    expect(f.open(4)).toBe(false);
    expect(m.scrollTop).toBe(0);
  });

  it("follows growing content while pinned", () => {
    const m = box();
    const f = new BottomFollower(m);
    f.open(1);
    f.endJumpGuard();
    m.scrollHeight = 1600;
    expect(f.followIfPinned()).toBe(true);
    expect(m.scrollTop).toBe(1200);
  });

  it("stops following once the reader scrolls up, and resumes at the bottom", () => {
    const m = box();
    const f = new BottomFollower(m);
    f.open(1);
    f.endJumpGuard();

    m.scrollTop = 100;
    f.handleScroll();
    expect(f.isPinned).toBe(false);
    m.scrollHeight = 1600;
    expect(f.followIfPinned()).toBe(false);
    expect(m.scrollTop).toBe(100);

    m.scrollTop = 1200;
    f.handleScroll();
    expect(f.isPinned).toBe(true);
    m.scrollHeight = 2000;
    expect(f.followIfPinned()).toBe(true);
    expect(m.scrollTop).toBe(1600);
  });

  it("ignores the scroll its own jump echoes back after late layout growth", () => {
    const m = box();
    const f = new BottomFollower(m);
    f.open(1);
    // The jump wrote scrollTop; before its scroll event is dispatched an image loads and grows the feed,
    // so the geometry now reads as far from the bottom. The reader never scrolled — stay pinned.
    m.scrollHeight = 1600;
    f.handleScroll();
    expect(f.isPinned).toBe(true);
  });

  it("only guards one scroll, and drops the guard when the frame passes", () => {
    const m = box();
    const f = new BottomFollower(m);
    f.open(1);
    f.handleScroll(); // the jump's own echo, swallowed
    m.scrollTop = 0;
    f.handleScroll(); // a real scroll
    expect(f.isPinned).toBe(false);

    // A jump that moves nothing fires no scroll event; endJumpGuard keeps the guard from eating the
    // reader's next one.
    f.followIfPinned();
    f.endJumpGuard();
    m.scrollTop = 0;
    f.handleScroll();
    expect(f.isPinned).toBe(false);
  });
});
