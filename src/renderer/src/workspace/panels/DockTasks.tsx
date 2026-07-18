import type { Task } from "@shared/types";
import { cx } from "../../ui/atoms";
import { useI18n } from "../../i18n";
import { EmptyState } from "./chrome";
import { DOCK_GUTTER, DockRow, MetricCell, MetricRack } from "./dock-row";
import {
  DOCK_GLYPH,
  DOCK_GLYPH_PULSE,
  taskDockStatus,
} from "./dock-status-glyph";
import { DOCK_LIVE_ROW } from "./dock-live-reveal";

/** Status rendering reads the dock's canonical table (dock-status-glyph.ts) via taskDockStatus;
 *  SUBJECT_TONE below styles the subject text only. */
const SUBJECT_TONE: Record<Task["status"], string> = {
  completed: "text-(--ui-text-tertiary) line-through",
  in_progress: "text-(--ui-text-secondary)",
  blocked: "text-(--ui-text-secondary)",
  pending: "text-(--ui-text-secondary)",
};

/**
 * The Activity dock's Tasks tab: the session's task list with a status glyph and, for blocked tasks, the
 * blocking task IDs in the metric rack. Completion reads from the row glyphs, so there's no summary line.
 */
export function DockTasks({ tasks }: { tasks: Task[] }) {
  const { t: i18n } = useI18n();
  if (tasks.length === 0)
    return <EmptyState>{i18n.dock.tasks.empty}</EmptyState>;
  return (
    <div className="py-1" role="list">
      {tasks.map((task) => {
        const blockers = task.blockedBy ?? [];
        const glyph = DOCK_GLYPH[taskDockStatus(task.status)];
        return (
          <DockRow
            key={task.id}
            {...(glyph.animate ? DOCK_LIVE_ROW : undefined)}
            leading={
              <span
                className={cx(
                  DOCK_GUTTER,
                  "shrink-0 text-center font-mono text-meta",
                  glyph.tone,
                  glyph.animate && DOCK_GLYPH_PULSE,
                )}
              >
                {glyph.char}
              </span>
            }
            trailing={
              blockers.length > 0 ? (
                <MetricRack>
                  <MetricCell>
                    {i18n.dock.status.blocked}·{blockers.join(",")}
                  </MetricCell>
                </MetricRack>
              ) : undefined
            }
          >
            <span
              className={cx(
                "min-w-0 flex-1 truncate text-aux",
                SUBJECT_TONE[task.status],
              )}
              title={task.subject}
            >
              {task.subject}
            </span>
          </DockRow>
        );
      })}
    </div>
  );
}
