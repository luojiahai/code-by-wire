import { useStore } from "@nanostores/react";
import { atom } from "nanostores";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { $terminalTakeover } from "./store";
import { ensureTerminal } from "./terminals";
import { TerminalWorkspace } from "./workspace";

/**
 * The xterm hosts mount at the layout root and are CSS-overlayed onto whichever <TerminalSlot />
 * is active. Moving the host DOM detaches xterm's WebGL renderer (it observes its own attachment)
 * and resets the screen, so the host stays put and we chase the slot's bounding rect with
 * position:fixed. (hermes persistent.tsx, verbatim.)
 */

const $slot = atom<HTMLElement | null>(null);

export function TerminalSlot() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    $slot.set(el);
    return () => {
      if ($slot.get() === el) $slot.set(null);
    };
  }, []);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" ref={ref} />
  );
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const sameRect = (a: Rect | null, b: Rect): boolean =>
  !!a &&
  a.top === b.top &&
  a.left === b.left &&
  a.width === b.width &&
  a.height === b.height;

export function PersistentTerminal() {
  const slot = useStore($slot);
  const terminalTakeover = useStore($terminalTakeover);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  // VS Code parity: once the pane has ever been opened, keep the terminals mounted — and their
  // shells alive — even while hidden. Hiding just collapses the slot, so the overlay goes
  // invisible; nothing is torn down. Only an explicit per-tab close kills a pty.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (terminalTakeover && ready) {
      setMounted(true);
      ensureTerminal();
    }
  }, [terminalTakeover, ready]);

  useLayoutEffect(() => {
    if (!slot) {
      setRect(null);
      return;
    }
    // Don't run the per-frame slot-chase until the terminal has been opened at least once
    // (`mounted` latches on first open). The slot lives in the always-rendered Pane, so without
    // this gate a user who never opens the terminal would pay a 60fps getBoundingClientRect layout
    // loop for the whole session. Once mounted, keep chasing even while hidden (shells stay alive),
    // matching the mount-latch design — `mounted` never un-latches, so the loop persists.
    if (!terminalTakeover && !mounted) {
      return;
    }
    let prev: Rect | null = null;
    let frame = 0;
    const tick = (): void => {
      const r = slot.getBoundingClientRect();
      // Round the top/left INWARD (ceil) and the right/bottom OUTWARD (ceil) so the overlay covers
      // the slot's footprint without painting over the wrapper's 1px top/left borders. At a large
      // window the grid lands on fractional px; a floor() here pulls the overlay a sub-pixel left/up
      // into the border and hides it (the bug only showed full-screen — at ~1100px the grid was
      // integer-aligned). The resulting <1px inset on the top/left exposes the wrapper's own
      // --ui-editor-surface-background behind the overlay — the same color — so there's no gap.
      const top = Math.ceil(r.top);
      const left = Math.ceil(r.left);
      const next: Rect = {
        top,
        left,
        width: Math.ceil(r.right) - left,
        height: Math.ceil(r.bottom) - top,
      };
      if (!sameRect(prev, next)) {
        prev = next;
        setRect(next);
        if (next.width > 0 && next.height > 0) setReady(true);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [slot, terminalTakeover, mounted]);

  const visible = Boolean(rect && rect.width > 0 && rect.height > 0);

  const style: CSSProperties = {
    position: "fixed",
    top: rect?.top ?? 0,
    left: rect?.left ?? 0,
    width: rect?.width ?? 0,
    height: rect?.height ?? 0,
    display: "flex",
    flexDirection: "column",
    visibility: visible ? "visible" : "hidden",
    pointerEvents: visible ? "auto" : "none",
    // Below the pane resize sashes (z-20) so the drag handles still paint above the terminal.
    zIndex: 4,
    backgroundColor: "var(--color-code-surface)",
    contain: "layout size paint",
  };

  // Defer the FIRST mount until the pane is open and the slot has real dims — booting xterm/pty at
  // 0×0 starts the shell at 80×24 (and spawns a visible conhost on Windows). After that `mounted`
  // latches: shells persist while hidden.
  return (
    <div aria-hidden={!visible} style={style}>
      {mounted && <TerminalWorkspace />}
    </div>
  );
}
