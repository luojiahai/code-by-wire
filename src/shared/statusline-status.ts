import type { SessionState } from "./types";

/** The Statusline card's whole readout — assembled in main, rendered verbatim by the renderer. */
export interface StatuslineStatus {
  /** The user preference (app-settings store); default true. Off ⇒ state "off". */
  enabled: boolean;
  /** settings.json's statusLine currently points at our wrapper. */
  installed: boolean;
  state: "capturing" | "stale" | "fault" | "off";
  /** The wrapped block's refreshInterval (seconds), or null when unset (events-only rendering). */
  refreshInterval: number | null;
  /** Newest capture mtime across all sessions, or null when there are no captures. */
  lastCaptureMs: number | null;
  /** The staleness watch population: live sessions when refreshInterval is set (every live session
   *  should report on the timer), else only working ones (idle sessions legitimately go silent). */
  watchedSessions: number;
  /** Watched sessions with a fresh capture. */
  reportingSessions: number;
  /** Which population the coverage row counts — its label must match ("live" / "working"). */
  watchKind: "live" | "working";
  /** Plain-language fault-band message; present exactly when state is "fault". */
  fault?: string;
}

export interface StatuslineDeriveInputs {
  enabled: boolean;
  installed: boolean;
  /** Installer failure text (from launch or the last action), or null. */
  fault: string | null;
  refreshInterval: number | null;
  /** Freshest capture mtime per session id. */
  captures: ReadonlyMap<string, number>;
  sessions: readonly { id: string; state: SessionState }[];
  now: number;
}

/**
 * Statusline health from raw inputs. Staleness must not false-positive on healthy silence: with a
 * refreshInterval every live session reports on the timer, so the watch population is live (non-ended)
 * sessions and fresh means younger than 3× the interval (floored at 60s — one missed render isn't a
 * fault). Without an interval only working sessions render the statusline, so the population narrows to
 * those and fresh means younger than a flat 60s. Partial coverage stays "capturing" — telemetry is
 * flowing; the coverage row shows the gap.
 */
export function deriveStatuslineStatus(
  i: StatuslineDeriveInputs,
): StatuslineStatus {
  const mtimes = Array.from(i.captures.values());
  const lastCaptureMs = mtimes.length > 0 ? Math.max(...mtimes) : null;
  const watchKind: "live" | "working" =
    i.refreshInterval !== null ? "live" : "working";
  const watched = i.sessions.filter((s) =>
    watchKind === "live" ? s.state !== "ended" : s.state === "working",
  );
  const freshMs =
    i.refreshInterval !== null
      ? Math.max(3 * i.refreshInterval * 1000, 60_000)
      : 60_000;
  const reporting = watched.filter((s) => {
    const m = i.captures.get(s.id);
    return m !== undefined && i.now - m < freshMs;
  }).length;

  const base = {
    enabled: i.enabled,
    installed: i.installed,
    refreshInterval: i.refreshInterval,
    lastCaptureMs,
    watchedSessions: watched.length,
    reportingSessions: reporting,
    watchKind,
  };
  if (!i.enabled) return { ...base, state: "off" };
  if (i.fault !== null) return { ...base, state: "fault", fault: i.fault };
  if (!i.installed) {
    return {
      ...base,
      state: "fault",
      fault: "The statusline wrapper is not installed — Repair reinstalls it.",
    };
  }
  if (watched.length > 0 && reporting === 0) return { ...base, state: "stale" };
  return { ...base, state: "capturing" };
}
