import type { Monitor } from "@shared/types";
import { usePolledRead, type Read } from "./use-polled-read";

// `undefined` until the first read; `null` when the session has no transcript; a list once read.
export type MonitorsState = Monitor[] | null | undefined;

/** Adapt the monitors IPC result into the uniform Read shape (its payload key is `monitors`). Module-level
 *  so the hook's effect sees a stable reference. */
const readMonitors = (id: string, since?: number): Promise<Read<Monitor[]>> =>
  window.api
    .readMonitors(id, since)
    .then((r) =>
      r.status === "changed"
        ? { status: "changed", mtimeMs: r.mtimeMs, data: r.monitors }
        : r,
    );

/** Poll one session's monitor list on an interval. Mirrors useShells via the shared hook. */
export function useMonitors(sessionId: string): MonitorsState {
  return usePolledRead(sessionId, readMonitors);
}
