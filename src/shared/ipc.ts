import type { Session, ProviderCapabilities } from './types'
import type { TranscriptRead } from './transcript'
import type { TerminalApi } from './terminal'
import type { Stats } from './stats'

export const IPC = {
  overview: 'overview:get',
  refresh: 'sessions:refresh',
  capabilities: 'provider:capabilities',
  readTranscript: 'transcript:read',
} as const

/** Sessions plus the usage aggregates, read from the index in one pass so the list and the stats
 *  beside it never reflect different snapshots. */
export interface OverviewData {
  sessions: Session[]
  stats: Stats
}

export interface IpcApi {
  /** Read-only: the indexed sessions + stats as they stand, no sync — fast initial paint. */
  overview(): Promise<OverviewData>
  /** Sync the index against ~/.claude, then return the fresh sessions + stats from one read. */
  refresh(): Promise<OverviewData>
  capabilities(): Promise<ProviderCapabilities>
  readTranscript(id: string, sinceMtimeMs?: number): Promise<TranscriptRead>
}

/** Everything exposed on `window.api`: the request/response surface plus the Managed-terminal surface. */
export type AppApi = IpcApi & { terminal: TerminalApi }
