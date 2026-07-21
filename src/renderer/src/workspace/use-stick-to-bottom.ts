import { useEffect, useLayoutEffect, useRef } from "react";
import { useScrollArea } from "../ui/OverlayScroll";
import { isPinnedToBottom } from "./stick-to-bottom";

/**
 * The transcript feed's scroll rule, driving the enclosing OverlayScroll's element.
 *
 * Opening the view (any mount: selecting a session, flipping to the Transcript side, drilling a subagent)
 * lands at the bottom once, as soon as there's something to land on. After that the feed follows new
 * events only while the user is still parked at the bottom — scrolling up to read stops the follow, and
 * scrolling back down resumes it. `count` is the event count; a growth in it is one new bubble.
 */
export function useStickToBottom(count: number): void {
  const el = useScrollArea();
  // Both start out true-ish: nothing has been opened yet, and an unscrolled empty feed is at its bottom.
  const pinnedRef = useRef(true);
  const openedRef = useRef(false);

  // Track pinned-ness from the DOM rather than React state — a scroll burst must not re-render the list.
  // Content growing doesn't fire `scroll`, so a pinned reader stays pinned until they actually scroll.
  useEffect(() => {
    if (!el) return;
    const onScroll = () => {
      pinnedRef.current = isPinnedToBottom(el);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [el]);

  useLayoutEffect(() => {
    if (!el) return;
    const jump = () => {
      el.scrollTop = el.scrollHeight;
      pinnedRef.current = true;
    };
    if (!openedRef.current) {
      // Wait for the first read to land — an empty feed has no bottom worth jumping to.
      if (count === 0) return;
      openedRef.current = true;
      jump();
      // Markdown, KaTeX and images can grow the feed after this paint, leaving the one-shot short of the
      // real bottom; a second jump on the next frame catches that late layout.
      const frame = requestAnimationFrame(jump);
      return () => cancelAnimationFrame(frame);
    }
    if (pinnedRef.current) jump();
  }, [el, count]);
}
