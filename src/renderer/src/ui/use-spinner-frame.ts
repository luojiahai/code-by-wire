// src/renderer/src/ui/use-spinner-frame.ts
import { useSyncExternalStore } from "react";
import {
  SPINNER_FRAMES,
  SPINNER_INTERVAL_MS,
  SPINNER_STATIC_FRAME,
  nextSpinnerFrame,
} from "./session-glyph";

/** One module-level ticker shared by every working-state glyph: the interval starts on the first
 *  subscriber and stops at zero subscribers, so N spinning rows cost one timer and an idle app
 *  costs none. Lives apart from session-glyph.ts because it touches window/timers — that module
 *  must stay node-safe for tests/ui. */
let frame = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

/** Queried lazily per call (never at module scope): under prefers-reduced-motion the ticker never
 *  starts and the snapshot pins to the static `|` frame. */
function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (timer === null && !reducedMotion()) {
    timer = setInterval(() => {
      frame = nextSpinnerFrame(frame);
      listeners.forEach((l) => l());
    }, SPINNER_INTERVAL_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return reducedMotion() ? SPINNER_STATIC_FRAME : frame;
}

/** The current spinner character for a working-state glyph. Mount only while spinning (Lamp
 *  renders it via a working-only child component) so idle rows don't hold the timer open. */
export function useSpinnerFrame(): string {
  return SPINNER_FRAMES[useSyncExternalStore(subscribe, getSnapshot)];
}
