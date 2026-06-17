import { useCallback } from "react";
import type { ShellOutput } from "@shared/types";
import { usePolledRead, type Read } from "./use-polled-read";

export type ShellOutputState = ShellOutput | null | undefined;

/** Poll one background shell's output, gated on the drilled shell id. A clone of useSubagentTranscript:
 *  the read closes over shellId, so usePolledRead resets when the drilled shell changes; `undefined`
 *  disables it (nothing drilled). Lifted to WorkspaceBody so it survives the Managed tab toggle. */
export function useShellOutput(
  sessionId: string,
  shellId: string | undefined,
): ShellOutputState {
  const read = useCallback(
    (id: string, since?: number): Promise<Read<ShellOutput>> =>
      shellId === undefined
        ? Promise.resolve({ status: "absent" })
        : window.api
            .readShellOutput(id, shellId, since)
            .then((r) =>
              r.status === "changed"
                ? { status: "changed", mtimeMs: r.mtimeMs, data: r.output }
                : r,
            ),
    [shellId],
  );
  return usePolledRead(sessionId, read, shellId !== undefined);
}
