import type { Session, ProviderCapabilities, Account } from './types'
import type { TranscriptRead } from './transcript'
import type { TerminalApi } from './terminal'
import type { Stats } from './stats'

export const IPC = {
  overview: 'overview:get',
  refresh: 'sessions:refresh',
  capabilities: 'provider:capabilities',
  readTranscript: 'transcript:read',
} as const

/** The index-only slice: sessions + usage aggregates from one SQLite read, so the list and the stats
 *  beside it never reflect different snapshots. The SQLite index holds no live statusLine data (ADR-0002),
 *  so the account is added later — this is what the store returns, before the overlay. */
export interface IndexOverview {
  sessions: Session[]
  stats: Stats
}

/** What the renderer receives: the index slice plus the live statusLine overlay (ipc.ts assembles it). */
export interface OverviewData extends IndexOverview {
  /** App-wide account: billing mode + rate limits from the live statusLine. null when there is no
   *  statusLine data (no captures, or all stale) — the UI reads null as "no rate-limit bars". */
  account: Account | null
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
