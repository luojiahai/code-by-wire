import type { Task } from "@shared/types";
import { usePolledRead, type Read } from "./use-polled-read";

// `undefined` until the first read lands; `null` when the session has no tasks dir; a list once read.
export type TasksState = Task[] | null | undefined;

/** Adapt the tasks IPC result into the uniform Read shape (its payload key is `tasks`). Module-level so
 *  the hook's effect sees a stable reference. */
const readTasks = (id: string, since?: number): Promise<Read<Task[]>> =>
  window.api
    .readTasks(id, since)
    .then((r) =>
      r.status === "changed"
        ? { status: "changed", mtimeMs: r.mtimeMs, data: r.tasks }
        : r,
    );

/** Poll one session's task list on an interval. Mirrors useTranscript via the shared hook. */
export function useTasks(sessionId: string): TasksState {
  return usePolledRead(sessionId, readTasks);
}
