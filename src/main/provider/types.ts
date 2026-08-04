import type { PersistedSession, SessionCandidate } from "@shared/types";
import type {
  TranscriptReadWire,
  ToolResultDetail,
} from "@shared/transcript";
import type {
  TaskRead,
  ShellsRead,
  ShellOutputRead,
  MonitorsRead,
  MonitorOutputRead,
} from "@shared/ipc";
import type { MetricsRead } from "@shared/metrics";

/**
 * Every enumeration and read here is async because the claude provider ships the fs work to the
 * parse-worker utility process (#430, #432), keeping the main thread's poll tick flat no matter how
 * large the active transcript or the session population grows. A worker fault falls back to the
 * same read in-process — one janky pass at worst, never a lost result. What stays sync is what main
 * must answer from its own state: restate (no fs), and the resume/cwd/path resolutions behind
 * one-off user actions.
 */
export interface Provider {
  readonly id: string;
  /** Cheap enumeration of the sessions worth indexing this pass — no transcript parsed. */
  listCandidates(): Promise<SessionCandidate[]> | SessionCandidate[];
  /** Parse a candidate's transcript into a full snapshot — the expensive step. */
  summarize(candidate: SessionCandidate): Promise<PersistedSession>;
  /** Refresh a reused snapshot's state from fresh liveness, without reparsing the transcript. */
  restate(
    candidate: SessionCandidate,
    previous: PersistedSession,
  ): PersistedSession;
  /** Read one session's transcript into render-ready events — the on-demand read behind the Observed
   *  workspace view. `sinceMtimeMs` is the change token from the caller's last read; when it still
   *  matches, the result is `unchanged` and no file is read or parsed. A changed doc travels in wire
   *  form (one JSON string) so main can relay it to the renderer without an O(doc) decode. */
  readTranscript(
    id: string,
    sinceMtimeMs?: number,
  ): Promise<TranscriptReadWire> | TranscriptReadWire;
  /** Read one tool call's full command + output on demand. `agentId` reads it from that subagent's own
   *  transcript file (the drilled Subagent view) instead of the session transcript. Returns
   *  `{ found: false }` when the file/id can't be resolved. Not keyed by a change token. */
  getToolResult(
    id: string,
    toolUseId: string,
    agentId?: string,
  ): Promise<ToolResultDetail> | ToolResultDetail;
  /** Read one subagent's own transcript (its sidechain file) into render-ready events — the on-demand
   *  read behind drilling into a Subagent lane. `sinceMtimeMs` is the change token (the subagent file's
   *  mtime) from the caller's last read; an unchanged token skips the read. Mirrors readTranscript's
   *  changed / unchanged / absent / error contract and its wire form. */
  readSubagentTranscript(
    id: string,
    agentId: string,
    sinceMtimeMs?: number,
  ): Promise<TranscriptReadWire> | TranscriptReadWire;
  /** Read one session's task list (status + blockedBy deps) — the on-demand read behind the Tasks
   *  panel. `sinceMtimeMs` is the change token from the caller's last read; an unchanged store skips
   *  the read. */
  readTasks(id: string, sinceMtimeMs?: number): Promise<TaskRead> | TaskRead;
  /** List one session's background bash shells — the on-demand read behind the Shells tab. `sinceMtimeMs`
   *  is the change token (the transcript mtime); an unchanged transcript skips the read. */
  readShells(
    id: string,
    sinceMtimeMs?: number,
  ): Promise<ShellsRead> | ShellsRead;
  /** Read one background shell's output — the read behind drilling into a shell. `sinceMtimeMs` is the
   *  change token (the `.output` mtime, or the transcript mtime for the snapshot fallback). Mirrors
   *  readSubagentTranscript's changed / unchanged / absent / error contract. */
  readShellOutput(
    id: string,
    shellId: string,
    sinceMtimeMs?: number,
  ): Promise<ShellOutputRead> | ShellOutputRead;
  /** List one session's monitors — the on-demand read behind the Monitors tab. `sinceMtimeMs` is the
   *  change token (the transcript mtime); an unchanged transcript skips the read. */
  readMonitors(
    id: string,
    sinceMtimeMs?: number,
  ): Promise<MonitorsRead> | MonitorsRead;
  /** Read one monitor's output — the read behind drilling into a monitor. `sinceMtimeMs` is the change
   *  token (the `.output` mtime, or the transcript mtime for the stitched-events fallback). Mirrors
   *  readShellOutput's changed / unchanged / absent / error contract. */
  readMonitorOutput(
    id: string,
    monitorId: string,
    sinceMtimeMs?: number,
  ): Promise<MonitorOutputRead> | MonitorOutputRead;
  /** Read one session's lazy metrics (token speed, git, voice, remote). Mirrors readTranscript's path
   *  resolution + change token; skips the recompute when `sinceMtimeMs` still matches. */
  readMetrics(
    id: string,
    sinceMtimeMs?: number,
  ): Promise<MetricsRead> | MetricsRead;
  /** Resolve whether a session is still owned by a live process (the liveness re-check behind Resume's
   *  Ended-only state gate) and the working directory to resume it in. `rolloutPath` rides along for
   *  agents whose resume pty must register claim-bound to its file (codex); claude omits it. Null when
   *  nothing resolves a cwd. */
  resolveResumeTarget(
    id: string,
  ): { alive: boolean; cwd: string; rolloutPath?: string } | null;
  /** Resolve just a session's working directory, for actions that only need the folder (Open in).
   *  Cheaper than resolveResumeTarget: no liveness probe, and a targeted transcript lookup rather than a
   *  full index. Null when no cwd resolves. */
  resolveSessionCwd(id: string): string | null;
  /** Resolve the provider's JSONL source for diagnostics (Claude transcript or Codex rollout).
   *  The path never crosses IPC; main uses it for stat/count-only scanning. */
  resolveTranscriptPath(id: string): string | null;
}
