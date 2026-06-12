import type {
  ProviderCapabilities,
  PersistedSession,
  SessionCandidate,
} from "@shared/types";
import type { TranscriptRead } from "@shared/transcript";
import type { TaskRead } from "@shared/ipc";
import type { MetricsRead } from "@shared/metrics";

export interface Provider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  /** Cheap enumeration of the sessions worth indexing this pass — no transcript parsed. */
  listCandidates(): SessionCandidate[];
  /** Parse a candidate's transcript into a full snapshot (the expensive step). */
  summarize(candidate: SessionCandidate): PersistedSession;
  /** Refresh a reused snapshot's state from fresh liveness, without reparsing the transcript. */
  restate(
    candidate: SessionCandidate,
    previous: PersistedSession,
  ): PersistedSession;
  /** Read one session's transcript into render-ready events — the on-demand read behind the Observed
   *  workspace view. `sinceMtimeMs` is the change token from the caller's last read; when it still
   *  matches, the result is `unchanged` and no file is read or parsed. */
  readTranscript(id: string, sinceMtimeMs?: number): TranscriptRead;
  /** Read one session's task list (status + blockedBy deps) — the on-demand read behind the Tasks
   *  panel. `sinceMtimeMs` is the change token from the caller's last read; an unchanged store skips
   *  the read. */
  readTasks(id: string, sinceMtimeMs?: number): TaskRead;
  /** Read one session's lazy metrics (token speed, git, voice, remote). Mirrors readTranscript's path
   *  resolution + change token; skips the recompute when `sinceMtimeMs` still matches. */
  readMetrics(id: string, sinceMtimeMs?: number): MetricsRead;
  /** Resolve whether a session is still owned by a live process (the liveness re-check behind Adopt's
   *  Ended-only state gate) and the working directory to resume it in. Null when nothing resolves a cwd. */
  resolveAdoptTarget(id: string): { alive: boolean; cwd: string } | null;
}
