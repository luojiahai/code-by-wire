import type { ReadSettled } from './transcript'

/** Token throughput over the live rolling window. */
export interface TokenSpeed {
  inputTps: number
  outputTps: number
  totalTps: number
}

/** The local git glance for a session's working directory. Field-level null = "not applicable". */
export interface GitInfo {
  branch: string | null
  insertions: number
  deletions: number
  ahead: number | null
  behind: number | null
  sha: string | null
  dirty: boolean
}

/** The expensive, per-selected-session metrics, computed lazily off the main thread of the overview. Any
 *  field is null when its source is absent (no repo, no completed request, no voice/remote config). */
export interface SessionMetrics {
  tokenSpeed: TokenSpeed | null
  git: GitInfo | null
  voiceEnabled: boolean | null
  remoteControl: boolean | null
}

/** The on-demand metrics read: a fresh snapshot with a change token, or a shared settled outcome. */
export type MetricsRead = { status: 'changed'; mtimeMs: number; metrics: SessionMetrics } | ReadSettled
