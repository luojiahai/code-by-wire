/**
 * The normalized, render-ready projection of one session's transcript. The Observed workspace view
 * consumes this; a Provider produces it from its native transcript format (Claude: JSONL). It lives
 * in @shared because both the main-process parser and the renderer depend on the same shape.
 *
 * This is a SECOND projection over the transcript, distinct from TranscriptSummary (token sums,
 * derived state). That one answers "what is this session"; this one answers "what does it look like".
 */

/** A minimal diff: the removed and added lines of an edit, already split on newline. */
export interface DiffHunk {
  removed: string[]
  added: string[]
}

/** One rendered item in the conversation, in file order. */
export type TranscriptEvent =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool'; name: string; input: string }
  | { kind: 'diff'; tool: string; file: string; hunk: DiffHunk }
  | { kind: 'subagent'; agentType: string; description: string }

export interface TranscriptDoc {
  /** The conversation, oldest first. */
  events: TranscriptEvent[]
  /** Non-null when the transcript's tail left a prompt unanswered: a human-readable reason (a
   *  question, or the pending tool). The workspace shows it prominently for a Waiting session. */
  waitingReason: string | null
}

/**
 * The result of an on-demand transcript read. A discriminated union so a poll can answer "nothing
 * changed" without re-shipping (or even re-parsing) the whole doc:
 *
 *  - `changed`   — a fresh doc, with `mtimeMs` as an opaque change token the caller echoes back as
 *                  `since` on the next read.
 *  - `unchanged` — the source hasn't moved since `since`; the caller keeps its current doc.
 *  - `absent`    — no transcript for this session (registry-only, or the file is gone).
 *  - `error`     — a transient read failure; the caller should keep its last doc and retry, NOT
 *                  fall back to the empty state (an unreadable file isn't a missing one).
 *
 * `mtimeMs` is a transport-level cache token, deliberately kept out of TranscriptDoc: the domain
 * projection says nothing about how a consumer dedupes polls, and a non-file-backed provider is free
 * to mint its own token.
 */
export type TranscriptRead =
  | { status: 'changed'; mtimeMs: number; doc: TranscriptDoc }
  | { status: 'unchanged'; mtimeMs: number }
  | { status: 'absent' }
  | { status: 'error' }
