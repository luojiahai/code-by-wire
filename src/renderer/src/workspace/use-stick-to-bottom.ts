import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useScrollArea } from "../ui/OverlayScroll";
import { BottomFollower } from "./stick-to-bottom";

/**
 * The transcript feed's scroll rule, driving the enclosing OverlayScroll's element. The decisions live in
 * BottomFollower; this hook is the DOM wiring around it.
 *
 * Opening the view (any mount: selecting a session, flipping to the Transcript side, drilling a subagent)
 * lands at the bottom once, as soon as there's something to land on. After that the feed follows new
 * content only while the reader is still parked at the bottom — scrolling up to read stops the follow, and
 * scrolling back down resumes it.
 *
 * Following keys off size, not off the event count: markdown, KaTeX and images grow the feed frames or
 * seconds after their event commits, a streamed reply grows one event in place, and the Waiting banner
 * mounts without adding an event. A ResizeObserver catches all of those. `count` only drives the extra
 * pre-paint jump on commit, so a new bubble never flashes below the fold before the observer fires.
 *
 * Returns the ref to put on the feed's own root element — the content whose height is watched.
 */
export function useStickToBottom(count: number) {
  const el = useScrollArea();
  const contentRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(count);
  countRef.current = count;
  const followerRef = useRef<BottomFollower | null>(null);
  const followerElRef = useRef<HTMLDivElement | null>(null);
  // Build (or rebuild, if the container is swapped under us) the state machine over the live element, so
  // stale pinned-ness can never leak across containers.
  if (el && followerElRef.current !== el) {
    followerRef.current = new BottomFollower(el);
    followerElRef.current = el;
  }

  // Drop the jump guard on the next frame: rAF callbacks run after the browser's scroll steps, so the
  // scroll event our jump caused has already been consumed by then — and a jump that moved nothing (the
  // container was at the bottom already, so no event fires) doesn't leave the guard armed against the
  // reader's next real scroll.
  const frameRef = useRef(0);
  const afterJump = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() =>
      followerRef.current?.endJumpGuard(),
    );
  }, []);

  useEffect(() => {
    const follower = followerRef.current;
    if (!el || !follower) return;
    const onScroll = () => follower.handleScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    // Watches both the content (it grows as markdown/KaTeX/images settle and as text streams in) and the
    // container (a window or sash resize shrinks the viewport out from under a pinned reader).
    const observer = new ResizeObserver(() => {
      if (follower.open(countRef.current) || follower.followIfPinned())
        afterJump();
    });
    observer.observe(el);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, [el, afterJump]);

  useLayoutEffect(() => {
    const follower = followerRef.current;
    if (!el || !follower) return;
    if (follower.open(count) || follower.followIfPinned()) afterJump();
  }, [el, count, afterJump]);

  return contentRef;
}
