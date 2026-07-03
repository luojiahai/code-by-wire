import type { Family, ModelSelection } from "./models";
import type { Session } from "./types";

/** Terminal IPC channels. `data` and `exit` are PUSH channels (main → renderer via webContents.send);
 *  the rest are renderer-initiated (invoke for a reply, send for fire-and-forget). */
export const TERMINAL = {
  spawn: "terminal:spawn",
  write: "terminal:write",
  resize: "terminal:resize",
  ack: "terminal:ack",
  kill: "terminal:kill",
  adopt: "terminal:adopt",
  fork: "terminal:fork",
  pickDirectory: "terminal:pick-directory",
  data: "terminal:data",
  exit: "terminal:exit",
  rename: "terminal:rename",
  reattach: "terminal:reattach",
} as const;

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
export const FLOW = {
  highWaterChars: 100_000,
  lowWaterChars: 5_000,
  ackChars: 5_000,
} as const;

// Enforce the invariant in code, not just prose: a future tweak that drops lowWaterChars below ackChars
// would silently wedge a paused pty, so fail loudly at import instead.
if (FLOW.lowWaterChars < FLOW.ackChars) {
  throw new Error(
    "FLOW invariant violated: lowWaterChars must be >= ackChars (a paused pty would never resume)",
  );
}

/** A fresh pinned session id (uuid v4) — the id the app correlates to the session's Transcript at
 *  `projects/<cwd-slug>/<id>.jsonl`. Minted in the renderer so its terminal is standing before spawn. */
export function newSessionId(): string {
  return crypto.randomUUID();
}

/**
 * A screen snapshot for replay after a window refresh. `offset` is the cumulative count of output chars
 * the snapshot already reflects (its position in the session's output stream). The renderer uses it to
 * drop the queued live chunks the snapshot already contains, so reattach doesn't render them twice — see
 * `TerminalApi.onData`, whose per-chunk offset is measured on the same stream.
 */
export interface ReattachSnapshot {
  data: string;
  offset: number;
}

export interface SpawnRequest {
  /** The pinned session id, minted by the caller so the renderer can stand up its terminal first. */
  id: string;
  /** Absolute project directory the session runs in. */
  cwd: string;
  model: ModelSelection;
  /** Initial terminal size; the renderer's first fit corrects it. */
  cols: number;
  rows: number;
}

/**
 * Adopt an Ended session: resume it under its own id in a Managed pty. The working directory is resolved
 * in main from the session's registry/Transcript, so the renderer sends only the id and its initial
 * terminal size (the view's first fit corrects the size).
 */
export interface AdoptRequest {
  id: string;
  cols: number;
  rows: number;
}

/**
 * Result of an Adopt attempt. Refused when the session is actually alive (the liveness re-check that
 * guards the one-process-per-Transcript invariant) or when no working directory can be resolved.
 */
export type AdoptResult =
  | { ok: true }
  | { ok: false; reason: "alive" | "unresolvable" };

/**
 * Fork a session: resume its conversation into a brand-new id with `--fork-session`. The renderer mints
 * `newId` (so it can stand up the fork's terminal first, like spawn) and names the `sourceId` to resume;
 * the working directory is resolved in main from the source's registry/Transcript.
 */
export interface ForkRequest {
  sourceId: string;
  newId: string;
  /** The source's model family, so main can hydrate the optimistic draft the way spawn does. The fork
   *  itself restores the model via --fork-session; this rides along only for the pre-discovery draft. */
  model: Family;
  cols: number;
  rows: number;
}

/**
 * Result of a Fork attempt. On success it carries the optimistic Managed draft, built in main from the
 * resolved cwd and the source's model exactly like spawn's, so the renderer shows it until discovery
 * indexes the fork's own Transcript. Refused only when no working directory can be resolved for the
 * source. Unlike Adopt there is no `"alive"` refusal, since a fork writes its own Transcript and stays
 * safe even while the source is still running.
 */
export type ForkResult =
  | { ok: true; session: Session }
  | { ok: false; reason: "unresolvable" };

/**
 * The Managed-terminal control + push surface, exposed on `window.api.terminal`. Spawning returns an
 * optimistic Managed draft Session the renderer shows until discovery indexes the real process.
 */
export interface TerminalApi {
  spawn(req: SpawnRequest): Promise<Session>;
  /** Adopt an Ended session by resuming it under its own id. Refused if it is actually alive. */
  adopt(req: AdoptRequest): Promise<AdoptResult>;
  /** Fork a session by resuming it into a new id. Refused only if the source's cwd can't be resolved. */
  fork(req: ForkRequest): Promise<ForkResult>;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  ack(id: string, charCount: number): void;
  kill(id: string): void;
  /** After a window refresh, fetch the current screen for a still-live managed session so the renderer
   *  can replay it into its fresh xterm. Resolves to the serialized screen plus the output offset it
   *  covers, or null if no live pty exists for `id` (e.g. the session ended). Resizes the live pty +
   *  recorder to (cols, rows) first so the serialized frame matches the renderer's grid. */
  reattach(
    id: string,
    cols: number,
    rows: number,
  ): Promise<ReattachSnapshot | null>;
  /** Open a native directory picker; resolves to the chosen path, or null if cancelled. */
  pickDirectory(): Promise<string | null>;
  /** Subscribe to batched output for ANY Managed session. The chunk carries its id and `offset`, the
   *  cumulative count of output chars through the end of this chunk — the renderer uses it to dedupe a
   *  reattach snapshot against in-flight output. Returns unsubscribe. */
  onData(cb: (id: string, data: string, offset: number) => void): () => void;
  /** Subscribe to process-exit for ANY Managed session. Returns unsubscribe. */
  onExit(cb: (id: string, exitCode: number) => void): () => void;
  /** Subscribe to a session-id rotation (a `/clear`): the live pty moved from `from` to `to`. The
   *  renderer follows it onto the new id. Returns unsubscribe. */
  onRename(cb: (from: string, to: string) => void): () => void;
}
