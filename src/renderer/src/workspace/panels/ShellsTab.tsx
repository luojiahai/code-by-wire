import type { BackgroundShell } from "@shared/types";
import { formatDuration, formatRelativeTime } from "@shared/format";
import { cx } from "../../ui/atoms";
import { EmptyState } from "./chrome";
import { shellGlyph } from "./shell-view";
import { DOCK_GUTTER, DockRow, MetricCell, MetricRack } from "./dock-row";

/** One background shell as a compact, clickable row: status glyph, command, duration, and a relative
 *  start. The exit code lives on the drill-in; the glyph carries pass/fail here. Clicking drills into the
 *  full log in the center pane. */
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
    <DockRow
      active={active}
      onClick={() => onDrill(shell)}
      aria-label={`Open log for ${shell.command}`}
      leading={
        <span
          className={cx(
            DOCK_GUTTER,
            "shrink-0 text-center font-mono text-meta",
            glyph.tone,
            shell.status === "running" && "animate-pulse-soft",
          )}
        >
          {glyph.char}
        </span>
      }
      trailing={
        <MetricRack>
          <MetricCell width="w-14" tone="text-(--ui-text-secondary)">
            {formatDuration(elapsed)}
          </MetricCell>
          {shell.startMs !== undefined && (
            <MetricCell width="w-12">
              {formatRelativeTime(shell.startMs, now)}
            </MetricCell>
          )}
        </MetricRack>
      }
    >
      <span
        className="min-w-0 flex-1 truncate text-aux"
        title={
          shell.description
            ? `${shell.description}  ${shell.command}`
            : shell.command
        }
      >
        {shell.description ? (
          <>
            <span className="text-(--ui-text-secondary)">
              {shell.description}
            </span>
            <span className="ml-2 font-mono text-meta text-(--ui-text-tertiary)">
              {shell.command}
            </span>
          </>
        ) : (
          <span className="font-mono text-meta text-(--ui-text-secondary)">
            {shell.command}
          </span>
        )}
      </span>
    </DockRow>
  );
}

/**
 * The Activity dock's Shells tab: a compact list of every background bash shell the session spawned,
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
    <div className="py-1" role="list">
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
