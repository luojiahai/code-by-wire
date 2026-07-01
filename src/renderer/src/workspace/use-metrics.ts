import type { SessionMetrics } from "@shared/metrics";
import { usePolledRead, type Read } from "./use-polled-read";

/** `undefined` until the first read; `null` when the session has no metrics source; a snapshot once read. */
export type MetricsState = SessionMetrics | null | undefined;

const readMetrics = (
  id: string,
  since?: number,
): Promise<Read<SessionMetrics>> =>
  window.api
    .readMetrics(id, since)
    .then((r) =>
      r.status === "changed"
        ? { status: "changed", mtimeMs: r.mtimeMs, data: r.metrics }
        : r,
    );

/** Poll one session's lazy metrics on an interval. Mirrors useTasks via the shared polled-read hook.
 *  `enabled` (default true) gates the poll — App.tsx calls this unconditionally (Rules of Hooks) but
 *  passes `hasSession` so it doesn't poll `readMetrics("", …)` when nothing is selected. */
export function useMetrics(sessionId: string, enabled = true): MetricsState {
  return usePolledRead(sessionId, readMetrics, enabled);
}
