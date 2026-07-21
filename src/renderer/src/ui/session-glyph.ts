import type { Management, SessionState } from "@shared/types";
import { tNow } from "../i18n";

/** The session status glyph (2026-07-17 spec §4, working redesigned same day, unified on the bar
 *  mark 2026-07-21): every state is the SAME four-slot mark, echoing the wordmark's own ░▒▓█
 *  density ramp — the signals are color, motion, and height, never shape. working sweeps teal;
 *  waiting flashes amber in unison (blocked on you); idle is a quiet constant gray; ended is the
 *  same bars squeezed flat to a dash — deliberately not a cross, since a session ending isn't a
 *  failure. Tones are backgrounds (not text colors) because bars are painted spans, not characters.
 *  Rendered by StateBars in atoms.tsx. */
export const BAR_MARK: Record<
  SessionState,
  {
    tone: string;
    height: string;
    /** Per-bar animate-bar-sweep, staggered by BAR_SWEEP_DELAYS_MS — the traveling peak. */
    sweep?: boolean;
    /** Applied to the wrapper, not per bar, so all four slots animate together. */
    animate?: string;
    dim?: string;
  }
> = {
  working: { tone: "bg-working-bright", height: "h-2.5", sweep: true },
  waiting: {
    tone: "bg-accent-bright",
    height: "h-2.5",
    animate: "animate-glyph-breathe motion-reduce:animate-none",
  },
  idle: { tone: "bg-idle", height: "h-2.5", dim: "opacity-55" },
  // ink-600, not ink-700: at 1px tall the bars have almost no mass, and the light theme's
  // ink-700 (#c4c4c8) sits ~1.1:1 against the #f5f5f5 sidebar. ink-600 is the ladder's
  // designated "Ended state, dim glyphs" step in both themes.
  ended: { tone: "bg-ink-600", height: "h-px" },
};

/** The working mark's stagger: each bar runs the same animate-bar-sweep keyframe (index.css) on its
 *  own clock, offset by one of these delays, so the brightness peak appears to travel across the
 *  row and back — pure CSS, no shared ticker. Only `working` sweeps. */
export const BAR_SWEEP_DELAYS_MS = [0, 160, 320, 480] as const;

/** Hover tooltip for a session glyph: "waiting · observed". The one spot the dot is spelled out in full.
 *  Plain function (not a hook), so it resolves the active locale via tNow() per call rather than
 *  capturing a translated string at module scope. */
export function glyphTitle(
  state: SessionState,
  management: Management,
): string {
  const t = tNow();
  const managementLabel =
    management === "managed"
      ? t.workspace.mode.managed.label
      : t.workspace.mode.observed.label;
  return `${t.shell.sessionRow.state[state].toLowerCase()} · ${managementLabel.toLowerCase()}`;
}
