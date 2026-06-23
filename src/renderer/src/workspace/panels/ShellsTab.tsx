import { type ReactNode } from "react";
import type { BackgroundShell } from "@shared/types";
import { formatDuration, formatRelativeTime } from "@shared/format";
import { cx } from "../../ui/atoms";
import { EmptyState } from "./chrome";
import { shellGlyph } from "./shell-view";

/** A right-aligned mono metric cell in a shell row. */
function MetaCell({
  children,
  tone = "text-fg-faint",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={cx("shrink-0 font-mono text-[10px] tabular-nums", tone)}>
      {children}
    </span>
  );
}

/** One background shell as a compact, clickable one-line row: status glyph, command, duration, and a
 *  source-agnostic relative start. The exit code lives on the drill-in; the glyph carries pass/fail here.
 *  Clicking drills into the full log in the center pane. */
function ShellRow({
  shell,
  active,
  now,
  onDrill,
}: {
  shell: BackgroundShell;
  active: boolean;
  now: number;
  onDrill: (shell: BackgroundShell) => void;
}) {
  const glyph = shellGlyph(shell);
  const elapsed =
    shell.status === "running" && shell.startMs !== undefined
      ? now - shell.startMs
      : (shell.durationMs ?? 0);
  return (
    <button
      type="button"
      onClick={() => onDrill(shell)}
      aria-label={`Open log for ${shell.command}`}
      className={cx(
        "flex w-full items-center gap-2 rounded-sm border-b border-ink-850 px-2 py-1.5 text-left transition-colors hover:bg-ink-900",
        active && "bg-ink-900 ring-1 ring-inset ring-accent",
      )}
    >
      <span
        className={cx(
          "w-3 shrink-0 text-center font-mono text-[11px]",
          glyph.tone,
          shell.status === "running" && "animate-pulse-soft",
        )}
      >
        {glyph.char}
      </span>
      <span
        className="min-w-0 flex-1 truncate font-mono text-[12px]"
        title={
          shell.description
            ? `${shell.description}  ${shell.command}`
            : shell.command
        }
      >
        {shell.description ? (
          <>
            <span className="text-fg">{shell.description}</span>{" "}
            <span className="text-fg-faint">{shell.command}</span>
          </>
        ) : (
          <span className="text-fg">{shell.command}</span>
        )}
      </span>
      <MetaCell tone="text-fg-muted">{formatDuration(elapsed)}</MetaCell>
      {shell.startMs !== undefined && (
        <MetaCell>{formatRelativeTime(shell.startMs, now)}</MetaCell>
      )}
    </button>
  );
}

/**
 * The Structure dock's Shells tab: a compact list of every background bash shell the session spawned,
 * ordered by start time. View-only — clicking a row drills into its full log in the center pane (no
 * inline expand, no kill controls). Empty until the session backgrounds a command.
 */
export function ShellsTab({
  shells,
  now,
  activeShellId,
  onDrill,
}: {
  shells: BackgroundShell[];
  now: number;
  activeShellId?: string;
  onDrill: (shell: BackgroundShell) => void;
}) {
  if (shells.length === 0)
    return <EmptyState>No background shells.</EmptyState>;
  return (
    <div className="py-1">
      {shells.map((s) => (
        <ShellRow
          key={s.id}
          shell={s}
          active={s.id === activeShellId}
          now={now}
          onDrill={onDrill}
        />
      ))}
    </div>
  );
}
