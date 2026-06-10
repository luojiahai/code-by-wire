import type { ModelId } from './models'
import type { ContextBreakdown } from './transcript'

export type { ModelId }

export type SessionState = 'working' | 'waiting' | 'idle' | 'ended'
export type Management = 'managed' | 'observed'

export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface Task {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  blockedBy?: string[]
}

export interface Subagent {
  id: string
  type: string
  status: 'working' | 'done' | 'failed'
  /** Absent until an assistant turn reports a model (a just-spawned agent has none yet). */
  model?: ModelId
  tokens: number
  durationMs: number
  children?: Subagent[]
}

export interface Session {
  id: string
  title: string
  project: string
  branch?: string
  state: SessionState
  management: Management
  model: ModelId
  contextPct: number
  contextWindow: number
  /** The live context split from the statusLine capture (current_usage), or null/undefined when no
   *  capture reported it. Preferred over the transcript-derived split in the Context panel. */
  liveContext?: ContextBreakdown | null
  /** The capture's raw model id and Claude's own label, used only for the honest model label (pricing
   *  and window still ride the normalized `model`). Absent when there's no capture. */
  modelId?: string
  modelDisplayName?: string
  usage: Usage
  equivApiValueUsd: number
  /** Live USD cost from the statusLine when a capture exists (Claude's own figure): real spend on an
   *  API account, Equivalent API value on a subscription. Absent ⇒ no statusLine sample for this Session. */
  liveCostUsd?: number
  /** Lines added/removed this session, from the statusLine `cost` block. Absent ⇒ no sample. */
  linesAdded?: number
  linesRemoved?: number
  lastActivityMs: number
  currentTask?: string
  waitingReason?: string
}

/**
 * The narrow per-session snapshot the index actually persists. Everything a SQLite row holds.
 * Derived display values (contextPct, equivApiValueUsd) are NOT stored — `hydrate` computes them
 * from these fields when a row is read back, so the formula lives in exactly one place.
 */
export interface PersistedSession {
  id: string
  title: string
  project: string
  branch?: string
  state: SessionState
  management: Management
  model: ModelId
  lastActivityMs: number
  /** Last parsed transcript tail left a prompt unanswered. Stored so state can be recomputed on a
   *  sync that skips the (unchanged) transcript, without reparsing it. */
  awaitingUser: boolean
  /** mtime (ms) of the transcript when it was last parsed — the incremental high-water mark. A sync
   *  reparses only when the file's current mtime exceeds this. 0 means the session has no transcript. */
  transcriptMtimeMs: number
  /** Token usage summed across the transcript's assistant turns — the basis for Equivalent API value. */
  usage: Usage
  /** Latest turn's full prompt (input + cache-read + cache-creation): the current context size, for context %. */
  contextTokens: number
}

/**
 * A session the index might track this pass, before the expensive transcript parse. Cheap to build
 * (a directory listing plus a stat), it carries just enough for the sync to decide whether to
 * reparse (`transcriptMtimeMs`) and how to derive state (`alive`, `status`).
 */
export interface SessionCandidate {
  id: string
  /** Is the owning process still alive? False for a transcript with no live registry entry — an Ended session. */
  alive: boolean
  /** The provider's raw status hint (Claude: 'busy' | 'waiting' | …), if the session has a live registry entry. */
  status?: string
  /** Working directory from the registry, if any. The transcript itself is the richer source once parsed. */
  cwd: string
  /** Absolute path to the transcript file, if one exists. */
  transcriptPath?: string
  /** Current transcript mtime (ms); 0 when there is no transcript. */
  transcriptMtimeMs: number
  /** Registry-reported last touch (ms), a fallback for last activity when there is no transcript. */
  updatedAt?: number
}

export interface RateLimit {
  /** Percent of the window consumed, 0–100 (the statusLine's used_percentage). */
  usedPct: number
  /** When the window resets, epoch ms. The statusLine reports epoch seconds; the reader normalizes to ms. */
  resetsAt: number
}

/** The app-wide account, derived from the freshest statusLine capture. Billing mode is detected from
 *  rate-limit presence (ADR-0001): a capture carrying rate_limits is a subscription; one without is
 *  `unknown` (absence is not proof of API billing). `api` stays in the union, since the domain defines it
 *  and costDisplay's real-spend branch keys on it, but the live inference never asserts it. */
export interface Account {
  billingMode: 'subscription' | 'api' | 'unknown'
  /** Present only for a subscription; otherwise no account rate limits. */
  fiveHour?: RateLimit
  sevenDay?: RateLimit
}

/** What a Provider can do. Drives graceful degradation in the UI. */
export interface ProviderCapabilities {
  canControl: boolean
  hasRateLimits: boolean
  hasSubagents: boolean
}
