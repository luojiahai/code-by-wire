import type { Session } from "./types";

/**
 * Stamp durable pin marks onto sessions, by id. Applied in overviewNow after the statusLine
 * overlay and title overrides — pins carry no display text, so order relative to those two is
 * inert, but keeping it last groups the "durable user data" passes together. A session with no
 * pin is returned untouched (same reference, so a no-op pass is cheap).
 */
export function applyPinOverrides(
  sessions: Session[],
  pins: Record<string, number>,
): Session[] {
  return sessions.map((s) =>
    pins[s.id] !== undefined ? { ...s, pinnedAtMs: pins[s.id] } : s,
  );
}
