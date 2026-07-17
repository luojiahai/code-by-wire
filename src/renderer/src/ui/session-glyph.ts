import type { Management, SessionState } from "@shared/types";
import { tNow } from "../i18n";

/** The session status glyph (2026-07-17 spec §4): terminal characters over the old SVG shapes,
 *  color as the second signal. working's char is the reduced-motion/static frame — live rows swap
 *  it per tick via useSpinnerFrame() (kept in its own module: this one stays pure and node-safe
 *  for tests/ui). waiting breathes via animate-glyph-breathe (index.css; floor .45 so the
 *  blocked-on-you state never fades out). idle keeps the old encoding's "hollow = not live" logic;
 *  ended's en dash is deliberately not a cross — a session ending isn't a failure. */
export const GLYPH: Record<
  SessionState,
  { char: string; tone: string; animate?: string }
> = {
  working: { char: "|", tone: "text-working-bright" },
  waiting: {
    char: "?",
    tone: "text-accent-bright",
    animate: "animate-glyph-breathe motion-reduce:animate-none",
  },
  idle: { char: "○", tone: "text-idle" },
  ended: { char: "–", tone: "text-ink-700" },
};

/** The working spinner's frames, in draw order — the classic shell cadence. */
export const SPINNER_FRAMES = ["-", "\\", "|", "/"] as const;

/** ~120ms per frame — quick enough to read as motion, slow enough not to strobe. */
export const SPINNER_INTERVAL_MS = 120;

/** The frame shown under prefers-reduced-motion: `|`, chosen over `-` because a static hyphen and
 *  ended's en dash would differ only by dash length. GLYPH.working.char must stay in sync. */
export const SPINNER_STATIC_FRAME = 2;

/** Pure frame advance — unit-testable without the ticker. */
export function nextSpinnerFrame(i: number): number {
  return (i + 1) % SPINNER_FRAMES.length;
}

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
