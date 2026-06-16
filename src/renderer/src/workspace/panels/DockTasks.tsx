import type { Task } from "@shared/types";
import { cx } from "../../ui/atoms";

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
 * The Structure dock's fixed left Tasks segment: the session's task list with status and blockedBy
 * dependencies. Always present — unlike the old rail panel it shows an empty state instead of vanishing,
 * so a Session's plan is never hidden.
 */
export function DockTasks({ tasks }: { tasks: Task[] }) {
  const done = tasks.filter((t) => t.status === "completed").length;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
          Tasks
        </h2>
        <span className="font-mono text-[10px] tabular-nums text-fg-faint">
          {done}/{tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className="text-[11px] text-fg-faint">No tasks yet.</p>
      ) : (
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
      )}
    </div>
  );
}
