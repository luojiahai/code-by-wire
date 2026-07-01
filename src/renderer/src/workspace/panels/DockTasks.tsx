import type { Task } from "@shared/types";
import { cx } from "../../ui/atoms";
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
  completed: "text-fg-faint",
  in_progress: "text-working-bright",
  blocked: "text-accent-bright",
  pending: "text-fg-muted",
};
const SUBJECT_TONE: Record<Task["status"], string> = {
  completed: "text-fg-faint line-through",
  in_progress: "text-fg",
  blocked: "text-fg-muted",
  pending: "text-fg",
};

/**
 * The Structure dock's Tasks tab: the session's task list with a status glyph and, for blocked tasks, the
 * blocking task IDs in the metric rack. Completion reads from the row glyphs, so there's no summary line.
 */
export function DockTasks({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return <EmptyState>No tasks yet.</EmptyState>;
  return (
    <div className="py-1" role="list">
      {tasks.map((t) => {
        const blockers = t.blockedBy ?? [];
        return (
          <DockRow
            key={t.id}
            leading={
              <span
                className={cx(
                  DOCK_GUTTER,
                  "shrink-0 text-center font-mono text-meta",
                  GLYPH_TONE[t.status],
                )}
              >
                {GLYPH[t.status]}
              </span>
            }
            trailing={
              blockers.length > 0 ? (
                <MetricRack>
                  <MetricCell>blocked·{blockers.join(",")}</MetricCell>
                </MetricRack>
              ) : undefined
            }
          >
            <span
              className={cx(
                "min-w-0 flex-1 truncate text-aux",
                SUBJECT_TONE[t.status],
              )}
              title={t.subject}
            >
              {t.subject}
            </span>
          </DockRow>
        );
      })}
    </div>
  );
}
