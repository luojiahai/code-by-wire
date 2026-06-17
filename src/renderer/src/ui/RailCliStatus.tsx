import type { CliStatus } from "@shared/cli-status";
import { footerView, type FooterView } from "./rail-footer";
import { Icon } from "./icons";
import { cx } from "./atoms";

// Dot hue by CLI state, from the reserved status palette: teal ok, amber warn, red error, slate pre-check.
const DOT_CLASS: Record<FooterView["dot"], string> = {
  ok: "bg-working",
  warn: "bg-accent",
  error: "bg-danger",
  idle: "bg-ink-600",
};

// The info button's border/text tone tracks the CLI state so a broken CLI draws the eye.
const BTN_CLASS: Record<FooterView["dot"], string> = {
  ok: "border-ink-700 text-fg-faint hover:border-ink-600 hover:text-fg-muted",
  warn: "border-accent/50 text-accent hover:border-accent",
  error: "border-danger/50 text-danger hover:border-danger",
  idle: "border-ink-700 text-fg-faint",
};

/** A slim band below the account card carrying the live Claude Code CLI status: a state dot, the label
 *  with its version, the status word, and an info button that opens the CLI status modal (the single
 *  home for version, path, re-check, and troubleshooting) in any resolved state. */
export function RailCliStatus({
  status,
  onOpenCliStatus,
}: {
  status: CliStatus | null;
  onOpenCliStatus: () => void;
}) {
  const v = footerView(status);
  const canOpen = status !== null;
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-t border-ink-800 px-3 py-2 font-mono text-[10px] text-fg-faint">
      <span className={cx("h-1.5 w-1.5 rounded-full", DOT_CLASS[v.dot])} />
      <span className="text-fg-muted">Claude Code</span>
      {v.version && <span className="text-fg-faint">v{v.version}</span>}
      <span className="uppercase tracking-wide">· {v.statusLabel}</span>
      <button
        type="button"
        onClick={onOpenCliStatus}
        disabled={!canOpen}
        aria-label="Claude Code status and settings"
        className={cx(
          "ml-auto inline-flex h-5 w-5 items-center justify-center rounded border transition-colors disabled:opacity-40",
          BTN_CLASS[v.dot],
        )}
      >
        <Icon name="info" size={12} />
      </button>
    </div>
  );
}
