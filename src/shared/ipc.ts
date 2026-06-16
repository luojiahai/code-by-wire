import type { Session, ProviderCapabilities, Account, Task } from "./types";
import type { TranscriptRead, ReadSettled } from "./transcript";
import type { TerminalApi } from "./terminal";
import type { MetricsRead } from "./metrics";
import type { ModelDefaults } from "./models";
import type { StatsSnapshot, StatsRange } from "./stats";
import type { CliStatus } from "./cli-status";
export const IPC = {
  overview: "overview:get",
  refresh: "sessions:refresh",
  capabilities: "provider:capabilities",
  readTranscript: "transcript:read",
  readSubagentTranscript: "subagentTranscript:read",
  readTasks: "tasks:read",
  readMetrics: "metrics:read",
  fullscreen: "window:fullscreen",
  modelDefaults: "model:defaults",
  readStats: "stats:read",
  recheckCli: "cli:recheck",
  setClaudeBinPath: "cli:setBinPath",
} as const;

/** The index-only slice: the indexed session list from one SQLite read. The SQLite index holds no
 *  live statusLine data (ADR-0002), so the account is added later — this is what the store returns,
 *  before the overlay. */
export interface IndexOverview {
  sessions: Session[];
}

/** What the renderer receives: the index slice plus the live statusLine overlay (ipc.ts assembles it). */
export interface OverviewData extends IndexOverview {
  /** App-wide account: billing mode + rate limits from the live statusLine. null when there is no
   *  statusLine data (no captures, or all stale) — the UI reads null as "no rate-limit bars". */
  account: Account | null;
  /** The cached Claude Code CLI verdict, or null before the first check completes. */
  cliStatus: CliStatus | null;
}

/** The result of an on-demand tasks read: a fresh list with a change token the caller echoes back as
 *  `since`, or one of the shared settled outcomes (see ReadSettled). */
export type TaskRead =
  | { status: "changed"; mtimeMs: number; tasks: Task[] }
  | ReadSettled;

/** The result of a Stats poll: a fresh snapshot with a change token the renderer echoes back as `since`,
 *  or `unchanged` when nothing the snapshot depends on has moved (no new turn, same local day, scan caught
 *  up, no in-place rewrite) — so the handler skips every aggregate and the renderer skips the re-render.
 *  Mirrors the transcript/tasks reads. */
export type StatsRead =
  | { status: "changed"; token: string; snapshot: StatsSnapshot }
  | { status: "unchanged"; token: string };

export interface IpcApi {
  /** Read-only: the indexed sessions as they stand, no sync — fast initial paint. */
  overview(): Promise<OverviewData>;
  /** Sync the index against ~/.claude, then return the fresh sessions from one read. */
  refresh(): Promise<OverviewData>;
  capabilities(): Promise<ProviderCapabilities>;
  readTranscript(id: string, sinceMtimeMs?: number): Promise<TranscriptRead>;
  /** Read one subagent's own transcript (its sidechain file) into render-ready events — the read behind
   *  drilling into a Subagent lane. `sinceMtimeMs` is the change token from the last read; an unchanged
   *  token skips the read. */
  readSubagentTranscript(
    id: string,
    agentId: string,
    sinceMtimeMs?: number,
  ): Promise<TranscriptRead>;
  /** Read one session's task list from ~/.claude/tasks/<id>/. `sinceMtimeMs` is the change token from
   *  the caller's last read; when it still matches, the result is `unchanged`. */
  readTasks(id: string, sinceMtimeMs?: number): Promise<TaskRead>;
  /** Read one session's lazy metrics (token speed, git, voice, remote). `sinceMtimeMs` is the change
   *  token from the last read; an unchanged token skips the recompute. */
  readMetrics(id: string, sinceMtimeMs?: number): Promise<MetricsRead>;
  /** Per-family model overrides, the configured default family, and the allowed-family allowlist —
   *  read from Claude Code's settings.json and the process env. */
  modelDefaults(): Promise<ModelDefaults>;
  /** Run one bounded, incremental scan step, then return a snapshot scoped to `range` (all-time when
   *  omitted) and `calendarYear` (trailing twelve months when omitted), tagged with a change token. Pass the
   *  last token as `since`; when nothing the snapshot depends on has moved, the result is `unchanged` and no
   *  snapshot is built. Polled while the Stats view is open; never rejects. */
  readStats(
    range?: StatsRange,
    calendarYear?: number,
    since?: string,
  ): Promise<StatsRead>;
  /** Force a fresh CLI status check (the footer's Re-check button). */
  recheckCli(): Promise<CliStatus>;
  /** Persist an absolute binary-path override (null clears it) and re-check. */
  setClaudeBinPath(path: string | null): Promise<CliStatus>;
}

/** Everything exposed on `window.api`: the request/response surface plus the Managed-terminal surface. */
export type AppApi = IpcApi & {
  terminal: TerminalApi;
  /** The host platform (`process.platform`), so the renderer can branch macOS-only chrome (the
   *  frameless title bar reserves space for the traffic lights only on darwin). */
  platform: string;
  /** Current web zoom factor (`webFrame.getZoomFactor()`), so the title bar can counter-zoom to a
   *  fixed physical size and keep the macOS traffic lights (OS-drawn, immune to web zoom) aligned. */
  getZoomFactor(): number;
  /** Subscribe to native macOS fullscreen changes. Main pushes the new state on every
   *  enter/leave-full-screen and on each load; the callback receives it, and the returned fn
   *  unsubscribes for effect cleanup. Off macOS main never sends, so the state stays false. */
  onFullscreenChange(cb: (isFullscreen: boolean) => void): () => void;
};
