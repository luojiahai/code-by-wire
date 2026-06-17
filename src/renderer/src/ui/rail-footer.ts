import type { CliStatus, CliStatusKind } from "@shared/cli-status";
import { STATUS_TONE, type CliStatusTone } from "./cli-status-view";

export interface FooterView {
  /** The status tone, plus `idle` for the pre-first-check placeholder (no kind to tone yet). */
  dot: CliStatusTone | "idle";
  statusLabel: string;
  version: string | null;
}

const LABEL: Record<CliStatusKind, string> = {
  ready: "ready",
  outdated: "too old",
  loggedOut: "logged out",
  unknown: "can't determine",
  notFound: "not found",
};

/** Pure view model for the footer. null status ⇒ the pre-first-check "checking…" placeholder. The footer
 *  is a glanceable strip — dot, label, version; path, detail, and troubleshooting all live in the modal. */
export function footerView(status: CliStatus | null): FooterView {
  if (!status) {
    return { dot: "idle", statusLabel: "checking…", version: null };
  }
  return {
    dot: STATUS_TONE[status.kind],
    statusLabel: LABEL[status.kind],
    version: status.version,
  };
}
