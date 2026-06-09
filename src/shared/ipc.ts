import type { Session, ProviderCapabilities } from './types'
import type { TranscriptView } from './transcript'

export const IPC = {
  listSessions: 'sessions:list',
  refresh: 'sessions:refresh',
  capabilities: 'provider:capabilities',
  readTranscript: 'transcript:read',
} as const

export interface IpcApi {
  listSessions(): Promise<Session[]>
  refresh(): Promise<Session[]>
  capabilities(): Promise<ProviderCapabilities>
  readTranscript(id: string): Promise<TranscriptView | null>
}
