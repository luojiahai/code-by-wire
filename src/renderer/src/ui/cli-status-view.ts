import type { CliStatus, CliStatusKind } from "@shared/cli-status";

/** The three CLI-status tones. Shared so the modal banner and the rail-footer dot speak one vocabulary. */
export type CliStatusTone = "ok" | "warn" | "error";

/** Single source of truth mapping a CLI status kind to its tone: green ready, amber for the recoverable
 *  states, red when no binary resolved. Both the modal banner and the footer dot key their colors off
 *  this, so a new kind forces one edit here rather than several scattered ones. */
export const STATUS_TONE: Record<CliStatusKind, CliStatusTone> = {
  ready: "ok",
  outdated: "warn",
  loggedOut: "warn",
  unknown: "warn",
  notFound: "error",
};

/** The presentational shape of the CLI status banner — the single dynamic region of the CLI status
 *  modal. Everything else in the modal (the version/path/config readout, the binary override, the
 *  footer actions) is invariant across states; only this banner changes. */
export interface CliStatusView {
  /** Banner hue: green ready, amber for the recoverable states, red when no binary resolved. */
  tone: CliStatusTone;
  /** Short title for the banner, e.g. "Ready" / "Update available". */
  headline: string;
  /** One-line advice under the headline. For non-ready states this is the CLI's own remedy hint;
   *  the actionable command(s) render separately from `remediesFor`. */
  detail: string;
}

const HEADLINE: Record<CliStatusKind, string> = {
  ready: "Ready",
  outdated: "Update available",
  loggedOut: "Logged out",
  unknown: "Status unknown",
  notFound: "Not found",
};

/** Resolve the banner's tone, headline, and detail from a CLI status. `ready` reads as a calm
 *  confirmation; every other kind surfaces the status's own one-liner (`detail`), falling back to a
 *  generic nudge when the check left none. */
export function cliStatusView(status: CliStatus): CliStatusView {
  return {
    tone: STATUS_TONE[status.kind],
    headline: HEADLINE[status.kind],
    detail:
      status.kind === "ready"
        ? "Up to date and ready."
        : (status.detail ?? "Action needed."),
  };
}
