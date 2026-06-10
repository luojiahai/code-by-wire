import type { ModelId } from './models'
import type { Session } from './types'

/** Terminal IPC channels. `data` and `exit` are PUSH channels (main → renderer via webContents.send);
 *  the rest are renderer-initiated (invoke for a reply, send for fire-and-forget). */
export const TERMINAL = {
  spawn: 'terminal:spawn',
  write: 'terminal:write',
  resize: 'terminal:resize',
  ack: 'terminal:ack',
  kill: 'terminal:kill',
  adopt: 'terminal:adopt',
  pickDirectory: 'terminal:pick-directory',
  data: 'terminal:data',
  exit: 'terminal:exit',
} as const

/**
 * Renderer→pty backpressure tunables, mirroring VSCode's FlowControlConstants (scaled). The pty host
 * pauses node-pty once `highWaterChars` are in flight unacknowledged and resumes once the backlog
 * drains below `lowWaterChars`; the renderer acks consumed output in `ackChars` chunks (one IPC per
 * chunk, not per write), each ack tied to xterm finishing its write so credit reflects render speed.
 *
 * INVARIANT: lowWaterChars >= ackChars. The renderer only acks whole `ackChars` chunks and holds the
 * sub-chunk remainder back, so after a burst fully drains the unacked count floors at
 * `(total mod ackChars)`, which is always < `ackChars`. Resume fires only below `lowWaterChars`, so if
 * `lowWaterChars` were < `ackChars` a paused pty could wedge forever with a remainder stuck above the
 * resume line and no flush. Keeping them equal (5000) is what guarantees a paused pty always resumes.
 */
export const FLOW = { highWaterChars: 100_000, lowWaterChars: 5_000, ackChars: 5_000 } as const

// Enforce the invariant in code, not just prose: a future tweak that drops lowWaterChars below ackChars
// would silently wedge a paused pty, so fail loudly at import instead.
if (FLOW.lowWaterChars < FLOW.ackChars) {
  throw new Error('FLOW invariant violated: lowWaterChars must be >= ackChars (a paused pty would never resume)')
}

/** A fresh pinned session id (uuid v4) — the id the app correlates to the session's Transcript at
 *  `projects/<cwd-slug>/<id>.jsonl`. Minted in the renderer so its terminal is standing before spawn. */
export function newSessionId(): string {
  return crypto.randomUUID()
}

export interface SpawnRequest {
  /** The pinned session id, minted by the caller so the renderer can stand up its terminal first. */
  id: string
  /** Absolute project directory the session runs in. */
  cwd: string
  model: ModelId
  /** Initial terminal size; the renderer's first fit corrects it. */
  cols: number
  rows: number
}

/**
 * Adopt an Ended session: resume it under its own id in a Managed pty. The working directory is resolved
 * in main from the session's registry/Transcript, so the renderer sends only the id and its initial
 * terminal size (the view's first fit corrects the size).
 */
export interface AdoptRequest {
  id: string
  cols: number
  rows: number
}

/**
 * Result of an Adopt attempt. Refused when the session is actually alive (the liveness re-check that
 * guards the one-process-per-Transcript invariant) or when no working directory can be resolved.
 */
export type AdoptResult = { ok: true } | { ok: false; reason: 'alive' | 'unresolvable' }

/**
 * The Managed-terminal control + push surface, exposed on `window.api.terminal`. Spawning returns an
 * optimistic Managed draft Session the renderer shows until discovery indexes the real process.
 */
export interface TerminalApi {
  spawn(req: SpawnRequest): Promise<Session>
  /** Adopt an Ended session by resuming it under its own id. Refused if it is actually alive. */
  adopt(req: AdoptRequest): Promise<AdoptResult>
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  ack(id: string, charCount: number): void
  kill(id: string): void
  /** Open a native directory picker; resolves to the chosen path, or null if cancelled. */
  pickDirectory(): Promise<string | null>
  /** Subscribe to batched output for ANY Managed session (the chunk carries its id). Returns unsubscribe. */
  onData(cb: (id: string, data: string) => void): () => void
  /** Subscribe to process-exit for ANY Managed session. Returns unsubscribe. */
  onExit(cb: (id: string, exitCode: number) => void): () => void
}
