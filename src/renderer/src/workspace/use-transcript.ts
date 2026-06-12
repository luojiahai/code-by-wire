import type { TranscriptDoc } from "@shared/transcript";
import { usePolledRead, type Read } from "./use-polled-read";

// Tri-state: `undefined` = the first read hasn't landed (show the shell), `null` = read and there's no
// transcript (show the empty state), a doc = render it.
export type DocState = TranscriptDoc | null | undefined;

/** Adapt the transcript IPC result into the uniform Read shape (its payload key is `doc`). Module-level
 *  so the hook's effect sees a stable reference. */
const readTranscript = (
  id: string,
  since?: number,
): Promise<Read<TranscriptDoc>> =>
  window.api
    .readTranscript(id, since)
    .then((r) =>
      r.status === "changed"
        ? { status: "changed", mtimeMs: r.mtimeMs, data: r.doc }
        : r,
    );

/** Poll one session's transcript on an interval, returning the latest doc. See usePolledRead. */
export function useTranscript(sessionId: string): DocState {
  return usePolledRead(sessionId, readTranscript);
}
