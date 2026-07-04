import type { Management, SessionState } from "@shared/types";
import { STATE_META } from "./meta";

/** The lamp encoding (2026-07-04 sidebar spec §1): filled = live, hollow = quiet. Working is an
 *  11px spinning arc over a static 4px core; Waiting a 6px amber dot breathing a halo; Idle a 6px
 *  hollow ring; Ended a 4px ember. Literal Tailwind class strings so the scanner emits every
 *  utility (the same rule the old STATE_META.ring relied on), kept in this JSX-free module so the
 *  encoding stays unit-tested. Management is no longer drawn — glyphTitle's tooltip is where it survives. */
export const LAMP: Record<SessionState, { outer: string; core?: string }> = {
  working: {
    outer:
      "h-[11px] w-[11px] rounded-full border-[1.5px] border-working/25 border-t-working animate-spin motion-reduce:animate-none",
    core: "absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-working",
  },
  waiting: {
    outer:
      "h-1.5 w-1.5 rounded-full bg-accent animate-halo motion-reduce:animate-none",
  },
  idle: {
    outer: "h-1.5 w-1.5 rounded-full border-[1.5px] border-idle bg-transparent",
  },
  ended: {
    outer: "h-1 w-1 rounded-full bg-ink-700",
  },
};

/** Hover tooltip for a session glyph: "waiting · observed". The one spot the dot is spelled out in full. */
export function glyphTitle(
  state: SessionState,
  management: Management,
): string {
  return `${STATE_META[state].label.toLowerCase()} · ${management}`;
}
