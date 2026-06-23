import type {
  ProviderCapabilities,
  PersistedSession,
  SessionCandidate,
} from "@shared/types";
import type { TranscriptRead, ToolResultDetail } from "@shared/transcript";
import type { TaskRead, ShellsRead, ShellOutputRead } from "@shared/ipc";
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
  /** Read one tool call's full command + output on demand. `agentId` reads it from that subagent's own
   *  transcript file (the drilled Subagent view) instead of the session transcript. Returns
   *  `{ found: false }` when the file/id can't be resolved. Not keyed by a change token. */
  getToolResult(
    id: string,
    toolUseId: string,
    agentId?: string,
  ): ToolResultDetail;
  /** Read one subagent's own transcript (its sidechain file) into render-ready events — the on-demand
   *  read behind drilling into a Subagent lane. `sinceMtimeMs` is the change token (the subagent file's
   *  mtime) from the caller's last read; an unchanged token skips the read. Mirrors readTranscript's
   *  changed / unchanged / absent / error contract. */
  readSubagentTranscript(
    id: string,
    agentId: string,
    sinceMtimeMs?: number,
  ): TranscriptRead;
  /** Read one session's task list (status + blockedBy deps) — the on-demand read behind the Tasks
   *  panel. `sinceMtimeMs` is the change token from the caller's last read; an unchanged store skips
   *  the read. */
  readTasks(id: string, sinceMtimeMs?: number): TaskRead;
  /** List one session's background bash shells — the on-demand read behind the Shells tab. `sinceMtimeMs`
   *  is the change token (the transcript mtime); an unchanged transcript skips the read. */
  readShells(id: string, sinceMtimeMs?: number): ShellsRead;
  /** Read one background shell's output — the read behind drilling into a shell. `sinceMtimeMs` is the
   *  change token (the `.output` mtime, or the transcript mtime for the snapshot fallback). Mirrors
   *  readSubagentTranscript's changed / unchanged / absent / error contract. */
  readShellOutput(
    id: string,
    shellId: string,
    sinceMtimeMs?: number,
  ): ShellOutputRead;
  /** Read one session's lazy metrics (token speed, git, voice, remote). Mirrors readTranscript's path
   *  resolution + change token; skips the recompute when `sinceMtimeMs` still matches. */
  readMetrics(id: string, sinceMtimeMs?: number): MetricsRead;
  /** Resolve whether a session is still owned by a live process (the liveness re-check behind Adopt's
   *  Ended-only state gate) and the working directory to resume it in. Null when nothing resolves a cwd. */
  resolveAdoptTarget(id: string): { alive: boolean; cwd: string } | null;
  /** Resolve just a session's working directory, for actions that only need the folder (Open in).
   *  Cheaper than resolveAdoptTarget: no liveness probe, and a targeted transcript lookup rather than a
   *  full index. Null when no cwd resolves. */
  resolveSessionCwd(id: string): string | null;
}
