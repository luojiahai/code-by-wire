import type { Task } from "@shared/types";
import { cx } from "../../ui/atoms";
import { EmptyState } from "./chrome";

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
 * The Structure dock's Tasks tab panel: the session's task list with status and blockedBy dependencies,
 * plus a slim done/total summary. Self-pads to match the dock's other tab panels.
 */
export function DockTasks({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return <EmptyState>No tasks yet.</EmptyState>;
  const done = tasks.filter((t) => t.status === "completed").length;
  return (
    <div className="space-y-2 px-4 py-3">
      <p className="font-mono text-[10px] tabular-nums text-fg-faint">
        {done}/{tasks.length} done
      </p>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-baseline gap-2">
            <span
              className={cx(
                "shrink-0 font-mono text-[11px]",
                GLYPH_TONE[t.status],
              )}
            >
              {GLYPH[t.status]}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cx("truncate text-[12px]", SUBJECT_TONE[t.status])}
                title={t.subject}
              >
                {t.subject}
              </p>
              {t.blockedBy && t.blockedBy.length > 0 && (
                <p className="text-[10px] text-fg-faint">
                  blocked by {t.blockedBy.join(", ")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
