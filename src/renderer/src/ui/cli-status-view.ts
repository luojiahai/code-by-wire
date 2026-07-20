import type { CliStatus, CliStatusKind } from "@shared/cli-status";
import { tNow } from "../i18n";
import type { Translations } from "../i18n";

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
  /** One-line advice under the headline. For non-ready states this is the CLI's own remedy hint —
   *  what's wrong, not how to fix it; the fault band's docs link covers the "how". */
  detail: string;
}

function headlineFor(kind: CliStatusKind, t: Translations): string {
  switch (kind) {
    case "ready":
      return t.settings.cli.headlineReady;
    case "outdated":
      return t.settings.cli.headlineOutdated;
    case "loggedOut":
      return t.settings.cli.headlineLoggedOut;
    case "unknown":
      return t.settings.cli.headlineUnknown;
    case "notFound":
      return t.settings.cli.headlineNotFound;
  }
}

/** Resolve the banner's tone, headline, and detail from a CLI status. `ready` reads as a calm
 *  confirmation; every other kind surfaces the status's own one-liner (`detail`), falling back to a
 *  generic nudge when the check left none. `t` defaults to the live locale via `tNow()` — evaluated
 *  per call, never captured — so existing single-arg call sites (and tests, which pin the English
 *  default) keep working while CliCard.tsx passes its own `useI18n()` catalog explicitly. */
export function cliStatusView(
  status: CliStatus,
  t: Translations = tNow(),
): CliStatusView {
  return {
    tone: STATUS_TONE[status.kind],
    headline: headlineFor(status.kind, t),
    detail:
      status.kind === "ready"
        ? t.settings.cli.detailReady
        : (status.detail ?? t.settings.cli.detailFallback),
  };
}
