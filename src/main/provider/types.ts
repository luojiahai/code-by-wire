import type { ProviderCapabilities, PersistedSession, SessionCandidate } from '@shared/types'
import type { TranscriptRead } from '@shared/transcript'

export interface Provider {
  readonly id: string
  readonly capabilities: ProviderCapabilities
  /** Cheap enumeration of the sessions worth indexing this pass — no transcript parsed. */
  listCandidates(): SessionCandidate[]
  /** Parse a candidate's transcript into a full snapshot (the expensive step). */
  summarize(candidate: SessionCandidate): PersistedSession
  /** Refresh a reused snapshot's state from fresh liveness, without reparsing the transcript. */
  restate(candidate: SessionCandidate, previous: PersistedSession): PersistedSession
  /** Read one session's transcript into render-ready events — the on-demand read behind the Observed
   *  workspace view. `sinceMtimeMs` is the change token from the caller's last read; when it still
   *  matches, the result is `unchanged` and no file is read or parsed. */
  readTranscript(id: string, sinceMtimeMs?: number): TranscriptRead
}
