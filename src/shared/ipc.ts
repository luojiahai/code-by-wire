import type {
  Session,
  ProviderCapabilities,
  Account,
  Task,
  BackgroundShell,
  ShellOutput,
} from "./types";
import type {
  TranscriptRead,
  ReadSettled,
  ToolResultDetail,
} from "./transcript";
import type { TerminalApi } from "./terminal";
import type { MetricsRead } from "./metrics";
import type { ModelDefaults } from "./models";
import type { StatsSnapshot, StatsRange } from "./stats";
import type { CliStatus } from "./cli-status";
import type { UpdateState } from "./update";
import type { StatuslineStatus } from "./statusline-status";
export { type UpdateState };
export const IPC = {
  overview: "overview:get",
  refresh: "sessions:refresh",
  capabilities: "provider:capabilities",
  readTranscript: "transcript:read",
  readSubagentTranscript: "subagentTranscript:read",
  readTasks: "tasks:read",
  readShells: "shells:read",
  readShellOutput: "shellOutput:read",
  readMetrics: "metrics:read",
  fullscreen: "window:fullscreen",
  modelDefaults: "model:defaults",
  readStats: "stats:read",
  recheckCli: "cli:recheck",
  setClaudeBinPath: "cli:setBinPath",
  resetAnalytics: "analytics:reset",
  openExternal: "shell:openExternal",
  openIn: "shell:openIn",
  clipboardWriteText: "clipboard:writeText",
  renameSession: "session:rename",
  getToolResult: "toolResult:get",
  updateGetState: "update:getState",
  updateCheck: "update:check",
  updateDownload: "update:download",
  updateInstall: "update:install",
  updateGetAutoCheck: "update:getAutoCheck",
  updateSetAutoCheck: "update:setAutoCheck",
  statuslineGetStatus: "statusline:getStatus",
  statuslineSetEnabled: "statusline:setEnabled",
  statuslineSetRefreshInterval: "statusline:setRefreshInterval",
  statuslineRepair: "statusline:repair",
  /** PUSH: main -> renderer on every update-state transition. */
  updateState: "update:state",
} as const;

/** The index-only slice: the indexed session list from one SQLite read. The SQLite index holds no
 *  live statusLine data, so the account is added later — this is what the store returns,
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

/** The result of a background-shells list read: the session's shells with a change token, or a shared
 *  settled outcome. The list omits each shell's output path; the log is read separately via readShellOutput. */
export type ShellsRead =
  | { status: "changed"; mtimeMs: number; shells: BackgroundShell[] }
  | ReadSettled;

/** The result of a drilled shell-output read: the output with a change token, or a settled outcome.
 *  Polled only while a shell is open (gated like the subagent read). */
export type ShellOutputRead =
  | { status: "changed"; mtimeMs: number; output: ShellOutput }
  | ReadSettled;

/** The result of a Stats poll: a fresh snapshot with a change token the renderer echoes back as `since`,
 *  or `unchanged` when nothing the snapshot depends on has moved (no new turn, same local day, scan caught
 *  up, no in-place rewrite) — so the handler skips every aggregate and the renderer skips the re-render.
 *  Mirrors the transcript/tasks reads. */
export type StatsRead =
  | { status: "changed"; token: string; snapshot: StatsSnapshot }
  | { status: "unchanged"; token: string };

/** A target for the header's "Open in" dropdown. The renderer sends one of these plus the session id;
 *  the main process resolves the folder and opens it. */
export type OpenInTarget = "vscode" | "finder";

/** The result of an openIn request. The handler never throws to the renderer: every failure (no
 *  resolvable cwd, path gone, shell error) comes back as `{ ok: false, error }` so the menu can show it.
 *  A discriminated union, so a successful result can't carry an error and a failure must name one. */
export type OpenInResult = { ok: true } | { ok: false; error: string };

/** The message both the main handler and the renderer fall back to when an open fails without a more
 *  specific reason. Defined once here, the only module both layers import, so the two can't drift. */
export const OPEN_IN_FAILED_MESSAGE = "Couldn't open.";

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
  /** List one session's background shells (compact metadata for the dock). `sinceMtimeMs` is the change
   *  token; an unchanged transcript skips the read. */
  readShells(id: string, sinceMtimeMs?: number): Promise<ShellsRead>;
  /** Read one background shell's output — the read behind drilling into a shell. Prefers the live
   *  `.output` file, falls back to stitched transcript snapshots. `sinceMtimeMs` is the change token. */
  readShellOutput(
    id: string,
    shellId: string,
    sinceMtimeMs?: number,
  ): Promise<ShellOutputRead>;
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
  /** Drop the durable analytics store (turns + scan high-water marks) so the next stats poll rebuilds it
   *  from the transcripts on disk. Resolves `{ ok: false }` when no analytics store is wired or the clear
   *  fails; never rejects. */
  resetAnalytics(): Promise<{ ok: boolean }>;
  /** Open an http(s) URL in the user's default browser (the Git cell's PR link). Non-http(s) URLs are
   *  ignored by the main handler. */
  openExternal(url: string): Promise<void>;
  /** Open the session's working directory in `target`. The path is resolved in the main process from the
   *  session id (registry → transcript), so this works for ended sessions too. Never rejects. */
  openIn(id: string, target: OpenInTarget): Promise<OpenInResult>;
  /** Copy text to the system clipboard (the Git popover's branch / commit copy buttons). */
  clipboardWriteText(text: string): Promise<void>;
  /** Persist a display-name override for a session id (null or a value that trims to empty clears it,
   *  reverting to the derived/live name), then return the fresh overview with the override applied.
   *  Both overview() and refresh() also carry the override, since it is applied in overviewNow(). */
  renameSession(id: string, title: string | null): Promise<OverviewData>;
  /** Fetch one tool call's full command + output on demand (the tool turn's detail modal). Not polled;
   *  a one-shot read keyed by the tool_use id. `agentId` reads the call from that subagent's own
   *  transcript file instead of the session transcript (the drilled Subagent view). */
  getToolResult(
    id: string,
    toolUseId: string,
    agentId?: string,
  ): Promise<ToolResultDetail>;
  /** The current update state (initial paint + post-action reconciliation). */
  getUpdateState(): Promise<UpdateState>;
  /** Trigger a check; resolves to the resulting state. Live transitions also arrive via onUpdateState. */
  checkForUpdate(): Promise<UpdateState>;
  /** Download the available update. Progress arrives via onUpdateState. */
  downloadUpdate(): Promise<void>;
  /** Quit and install a downloaded update — the app quits, so this never resolves. */
  installUpdate(): void;
  /** Whether the launch check is enabled (missing setting reads as true). */
  getAutoCheckUpdates(): Promise<boolean>;
  /** Persist the launch-check preference. */
  setAutoCheckUpdates(enabled: boolean): Promise<void>;
  /** The Statusline card's readout: preference, install state, derived health, coverage. Assembled in
   *  main; polled by the System section every 3s while open. Never rejects. */
  getStatuslineStatus(): Promise<StatuslineStatus>;
  /** Toggle capture. Disable = uninstall (settings restored byte-for-byte, captures removed) + persist
   *  the preference; enable = clear it + install. Returns the fresh status; failures surface as
   *  state "fault", never a rejection. */
  setStatuslineEnabled(enabled: boolean): Promise<StatuslineStatus>;
  /** Write refreshInterval (seconds, 1–60 from the UI) into the wrapped statusLine block; null means
   *  events-only. Returns the fresh status. */
  setStatuslineRefreshInterval(
    seconds: number | null,
  ): Promise<StatuslineStatus>;
  /** Re-run the installer's self-heal (recovers a stripped entry / vanished record). Returns the
   *  fresh status. */
  repairStatusline(): Promise<StatuslineStatus>;
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
  /** Subscribe to update-state pushes. Main sends on every transition (including download progress);
   *  the returned fn unsubscribes. Mirrors onFullscreenChange. */
  onUpdateState(cb: (state: UpdateState) => void): () => void;
};
