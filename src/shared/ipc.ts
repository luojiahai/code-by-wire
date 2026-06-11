import type { Session, ProviderCapabilities, Account, Task } from './types'
import type { TranscriptRead, ReadSettled } from './transcript'
import type { TerminalApi } from './terminal'
import type { MetricsRead } from './metrics'
export const IPC = {
  overview: 'overview:get',
  refresh: 'sessions:refresh',
  capabilities: 'provider:capabilities',
  readTranscript: 'transcript:read',
  readTasks: 'tasks:read',
  readMetrics: 'metrics:read',
} as const

/** The index-only slice: the indexed session list from one SQLite read. The SQLite index holds no
 *  live statusLine data (ADR-0002), so the account is added later — this is what the store returns,
 *  before the overlay. */
export interface IndexOverview {
  sessions: Session[]
}

/** What the renderer receives: the index slice plus the live statusLine overlay (ipc.ts assembles it). */
export interface OverviewData extends IndexOverview {
  /** App-wide account: billing mode + rate limits from the live statusLine. null when there is no
   *  statusLine data (no captures, or all stale) — the UI reads null as "no rate-limit bars". */
  account: Account | null
}

/** The result of an on-demand tasks read: a fresh list with a change token the caller echoes back as
 *  `since`, or one of the shared settled outcomes (see ReadSettled). */
export type TaskRead = { status: 'changed'; mtimeMs: number; tasks: Task[] } | ReadSettled

export interface IpcApi {
  /** Read-only: the indexed sessions as they stand, no sync — fast initial paint. */
  overview(): Promise<OverviewData>
  /** Sync the index against ~/.claude, then return the fresh sessions from one read. */
  refresh(): Promise<OverviewData>
  capabilities(): Promise<ProviderCapabilities>
  readTranscript(id: string, sinceMtimeMs?: number): Promise<TranscriptRead>
  /** Read one session's task list from ~/.claude/tasks/<id>/. `sinceMtimeMs` is the change token from
   *  the caller's last read; when it still matches, the result is `unchanged`. */
  readTasks(id: string, sinceMtimeMs?: number): Promise<TaskRead>
  /** Read one session's lazy metrics (token speed, git, voice, remote). `sinceMtimeMs` is the change
   *  token from the last read; an unchanged token skips the recompute. */
  readMetrics(id: string, sinceMtimeMs?: number): Promise<MetricsRead>
}

/** Everything exposed on `window.api`: the request/response surface plus the Managed-terminal surface. */
export type AppApi = IpcApi & {
  terminal: TerminalApi
  /** The host platform (`process.platform`), so the renderer can branch macOS-only chrome (the
   *  frameless title bar reserves space for the traffic lights only on darwin). */
  platform: string
  /** Current web zoom factor (`webFrame.getZoomFactor()`), so the title bar can counter-zoom to a
   *  fixed physical size and keep the macOS traffic lights (OS-drawn, immune to web zoom) aligned. */
  getZoomFactor(): number
}
