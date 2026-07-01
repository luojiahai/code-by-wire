import type { CliStatus } from "@shared/cli-status";
import { cliStatusView } from "./cli-status-view";
import { Icon } from "./icons";
import { cx } from "./atoms";

/**
 * The master-caution strip: a drop-down banner under the title bar shown when the Claude Code CLI trips
 * (outdated, logged out, not found, or indeterminate). The whole strip is a button that jumps to
 * Settings → System, where the status detail and the remedy live. App hides it while already in Settings
 * (nothing to deep-link to) and during the pre-first-check window (no status to judge). Amber for the
 * recoverable states, red when no binary resolved — the same tones as the Sys lamp.
 */
export function CautionBanner({
  status,
  onOpenSystem,
}: {
  status: CliStatus;
  onOpenSystem: () => void;
}) {
  const view = cliStatusView(status);
  const error = view.tone === "error";
  return (
    <button
      type="button"
      onClick={onOpenSystem}
      className={cx(
        "flex w-full shrink-0 items-center gap-2.5 border-b px-4 py-2 text-left text-aux transition-colors",
        error
          ? "border-danger/30 bg-danger/10 hover:bg-danger/15"
          : "border-accent/30 bg-accent/10 hover:bg-accent/15",
      )}
    >
      <Icon
        name="triangle-alert"
        size={14}
        className={cx("shrink-0", error ? "text-danger" : "text-accent")}
      />
      <span className="min-w-0 flex-1 truncate text-fg-muted">
        <span className="font-medium text-fg">{view.headline}.</span>{" "}
        {view.detail}
      </span>
      <span
        className={cx(
          "shrink-0 font-medium",
          error ? "text-danger" : "text-accent",
        )}
      >
        Open System →
      </span>
    </button>
  );
}
