import { useCallback } from "react";
import type { ShellOutput } from "@shared/types";
import { usePolledRead, type Read } from "./use-polled-read";
import type { ShellOutputState } from "./use-shell-output";

/** Poll one monitor's output, gated on the drilled monitor id. A clone of useShellOutput: the read closes
 *  over monitorId, so usePolledRead resets when the drilled monitor changes; `undefined` disables it.
 *  Lifted to Workspace so it survives the Managed-terminal toggle. Reuses ShellOutputState. */
export function useMonitorOutput(
  sessionId: string,
  monitorId: string | undefined,
): ShellOutputState {
  const read = useCallback(
    (id: string, since?: number): Promise<Read<ShellOutput>> =>
      monitorId === undefined
        ? Promise.resolve({ status: "absent" })
        : window.api
            .readMonitorOutput(id, monitorId, since)
            .then((r) =>
              r.status === "changed"
                ? { status: "changed", mtimeMs: r.mtimeMs, data: r.output }
                : r,
            ),
    [monitorId],
  );
  return usePolledRead(sessionId, read, monitorId !== undefined);
}
