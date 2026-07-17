import type { BackgroundShell } from "@shared/types";
import { cx } from "../../ui/atoms";
import { useI18n } from "../../i18n";
import { EmptyState } from "./chrome";
import { shellGlyph } from "./shell-view";
import { DOCK_GUTTER, DockRow, MetricCell, MetricRack } from "./dock-row";
import { DOCK_GLYPH_PULSE } from "./dock-status-glyph";

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
  const { t } = useI18n();
  const glyph = shellGlyph(shell);
  const elapsed =
    shell.status === "running" && shell.startMs !== undefined
      ? now - shell.startMs
      : (shell.durationMs ?? 0);
  return (
    <DockRow
      active={active}
      onClick={() => onDrill(shell)}
      aria-label={t.dock.shells.openLogAria(shell.command)}
      leading={
        <span
          className={cx(
            DOCK_GUTTER,
            "shrink-0 text-center font-mono text-meta",
            glyph.tone,
            shell.status === "running" && DOCK_GLYPH_PULSE,
          )}
        >
          {glyph.char}
        </span>
      }
      trailing={
        <MetricRack>
          <MetricCell width="w-16" tone="text-(--ui-text-secondary)">
            {t.time.duration(elapsed)}
          </MetricCell>
          {shell.startMs !== undefined && (
            <MetricCell width="w-14">
              {t.time.ago(shell.startMs, now)}
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
  const { t } = useI18n();
  if (shells.length === 0)
    return <EmptyState>{t.dock.shells.empty}</EmptyState>;
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
