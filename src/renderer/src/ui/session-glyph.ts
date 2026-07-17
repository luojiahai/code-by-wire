import type { Management, SessionState } from "@shared/types";
import { tNow } from "../i18n";

/** The session status glyph (2026-07-17 spec §4, working redesigned same day): terminal
 *  characters for the three static/breathing states, color as the second signal. waiting breathes
 *  via animate-glyph-breathe (index.css; floor .45 so the blocked-on-you state never fades out).
 *  idle keeps the old encoding's "hollow = not live" logic; ended's en dash is deliberately not a
 *  cross — a session ending isn't a failure. working isn't in this table — it renders as
 *  WorkingBars (atoms.tsx) instead of a character; see WORKING_BAR_* below. */
export const GLYPH: Record<
  Exclude<SessionState, "working">,
  { char: string; tone: string; animate?: string }
> = {
  waiting: {
    char: "?",
    tone: "text-accent-bright",
    animate: "animate-glyph-breathe motion-reduce:animate-none",
  },
  idle: { char: "○", tone: "text-idle" },
  ended: { char: "–", tone: "text-ink-700" },
};

/** The working glyph: 4 bars sweeping left-to-right-to-left, like the wordmark's own ░▒▓█ density
 *  ramp — pure CSS (animate-bar-sweep, index.css), no shared ticker. Each bar runs the same
 *  keyframe on its own clock, offset by one of these delays, so the brightness peak appears to
 *  travel across the row and back. Tone is a background (not text) color since bars are painted
 *  divs, not glyph characters. */
export const WORKING_BAR_TONE = "bg-working-bright";
export const WORKING_BAR_DELAYS_MS = [0, 160, 320, 480] as const;

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
