import { formatRelativeTime } from "@shared/format";
import type { BackgroundShell } from "@shared/types";
import { cx } from "../ui/atoms";
import { ShellLog } from "./panels/ShellLog";
import { shellMetaSegments, shellStatusPill } from "./panels/shell-view";
import type { ShellOutputState } from "./use-shell-output";

/** The drilled-in background-shell surface: a fixed "Session › Shell" breadcrumb, a status header (pill +
 *  exit/duration/trigger + relative start) above the full command, then the output log. The header always
 *  renders from `shell`, so the pane is never blank — even when the command produced no output. A pure
 *  renderer; the output poll is lifted to WorkspaceBody so it survives the Managed tab toggle. Always
 *  read-only; cbw never controls a shell. */
export function ShellDrill({
  shell,
  label,
  now,
  onBack,
  output,
}: {
  shell: BackgroundShell | undefined;
  label: string;
  now: number;
  onBack: () => void;
  output: ShellOutputState;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-925 px-4 py-2 text-[11px]">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-fg-muted transition-colors hover:text-fg"
        >
          <span aria-hidden>←</span> Session
        </button>
        <span className="text-ink-700">›</span>
        <span className="font-mono font-semibold text-fg">Shell</span>
      </div>
      <ShellHeader shell={shell} command={shell?.command ?? label} now={now} />
      <div className="min-h-0 flex-1">
        <ShellLog output={output} />
      </div>
    </div>
  );
}

/** The status band above the log: the status pill (the one colored element), a meta row
 *  (exit · duration/elapsed · trigger), a right-aligned relative start, then the full command and its
 *  optional description. Renders from the live `shell`; falls back to the bare command (no pill, no meta)
 *  when the shell was reaped from the list while drilled. */
function ShellHeader({
  shell,
  command,
  now,
}: {
  shell: BackgroundShell | undefined;
  command: string;
  now: number;
}) {
  const pill = shell ? shellStatusPill(shell) : undefined;
  const meta = shell ? shellMetaSegments(shell, now) : [];
  const startedAt =
    shell?.startMs !== undefined
      ? formatRelativeTime(shell.startMs, now)
      : undefined;
  return (
    <div className="shrink-0 border-b border-ink-850 bg-ink-925">
      <div className="flex items-center gap-2.5 px-4 pt-2.5">
        {pill && (
          <span
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full border border-ink-800 px-2 py-0.5 text-[10px]",
              pill.tone,
              shell?.status === "running" && "animate-pulse-soft",
            )}
          >
            <span aria-hidden>{pill.glyph}</span>
            {pill.label}
          </span>
        )}
        {meta.length > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-fg-faint">
            {meta.join(" · ")}
          </span>
        )}
        {startedAt && (
          <span className="ml-auto font-mono text-[10px] tabular-nums text-fg-faint">
            {startedAt}
          </span>
        )}
      </div>
      <div className="px-4 pb-2.5 pt-1.5">
        <div className="font-mono text-[12.5px] text-fg">
          <span className="text-primary">$</span>{" "}
          <span className="break-all">{command}</span>
        </div>
        {shell?.description && (
          <div className="mt-1 font-mono text-[10.5px] text-fg-faint">
            {shell.description}
          </div>
        )}
      </div>
    </div>
  );
}
