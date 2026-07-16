import type { Task } from "@shared/types";
import { cx } from "../../ui/atoms";
import { useI18n } from "../../i18n";
import { EmptyState } from "./chrome";
import { DOCK_GUTTER, DockRow, MetricCell, MetricRack } from "./dock-row";

/** Glyph + tone per task status, reusing the app's palette (no new color tokens). */
const GLYPH: Record<Task["status"], string> = {
  completed: "✓",
  in_progress: "◐",
  blocked: "⊘",
  pending: "○",
};
const GLYPH_TONE: Record<Task["status"], string> = {
  completed: "text-(--ui-text-tertiary)",
  in_progress: "text-working-bright",
  blocked: "text-accent-bright",
  pending: "text-(--ui-text-secondary)",
};
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
        return (
          <DockRow
            key={task.id}
            leading={
              <span
                className={cx(
                  DOCK_GUTTER,
                  "shrink-0 text-center font-mono text-meta",
                  GLYPH_TONE[task.status],
                )}
              >
                {GLYPH[task.status]}
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
