/**
 * The normalized, render-ready projection of one session's transcript. The Observed workspace view
 * consumes this; a Provider produces it from its native transcript format (Claude: JSONL). It lives
 * in @shared because both the main-process parser and the renderer depend on the same shape.
 *
 * This is a SECOND projection over the transcript, distinct from TranscriptSummary (token sums,
 * derived state). That one answers "what is this session"; this one answers "what does it look like".
 */
import type { Subagent } from "./types";

/** A minimal diff: the removed and added lines of an edit, already split on newline. */
export interface DiffHunk {
  removed: string[];
  added: string[];
}

/** The current context's cache-state split: the latest assistant turn's prompt, broken into the part
 *  read from cache (the stable bulk), the part newly cached this turn, and the fresh uncached input.
 *  Summed, these are the session's current context size. */
export interface ContextBreakdown {
  input: number;
  cacheRead: number;
  cacheCreation: number;
}

/** One turn in the timeline: a user prompt and the assistant work it triggered, up to the next prompt.
 *  Times are epoch ms from the transcript; durationMs is endMs − startMs (0 while a turn is single-line
 *  or still in flight). toolCount excludes subagent-internal tools — those live in their own transcript. */
export interface TurnSummary {
  /** 1-based turn number in file order. */
  index: number;
  /** Short, single-line label from the user prompt (slash commands by name). */
  prompt: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  toolCount: number;
}

/** One rendered item in the conversation, in file order. */
export type TranscriptEvent =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; name: string; input: string }
  | { kind: "diff"; tool: string; file: string; hunk: DiffHunk }
  | { kind: "subagent"; agentType: string; description: string };

export interface TranscriptDoc {
  /** The conversation, oldest first. */
  events: TranscriptEvent[];
  /** Non-null when the transcript's tail left a prompt unanswered: a human-readable reason (a
   *  question, or the pending tool). The workspace shows it prominently for a Waiting session. */
  waitingReason: string | null;
  /** Turn-by-turn timeline, oldest first. Empty when the transcript has no real user prompt yet. */
  turns: TurnSummary[];
  /** Current context cache-state split, or null when no assistant turn has reported usage. */
  context: ContextBreakdown | null;
  /** The session's subagent forest, reconstructed from its external subagent transcripts. Roots are
   *  dispatched from the main transcript; children nest under the agent that dispatched them. Empty
   *  when the session spawned no subagents. */
  subagents: Subagent[];
}

/**
 * The non-payload outcomes shared by every on-demand read. A poll can answer "nothing changed" without
 * re-shipping (or even re-parsing) anything:
 *
 *  - `unchanged` — the source hasn't moved since `since`; the caller keeps its current value. `mtimeMs`
 *                  is an opaque change token the caller echoes back as `since` on the next read.
 *  - `absent`    — no source for this session (registry-only, or the file/dir is gone).
 *  - `error`     — a transient read failure; the caller should keep its last value and retry, NOT fall
 *                  back to the empty state (an unreadable file isn't a missing one).
 *
 * `mtimeMs` is a transport-level cache token, deliberately kept out of the payload type: the domain
 * projection says nothing about how a consumer dedupes polls, and a non-file-backed provider is free to
 * mint its own token. The matching `changed` variant carries the payload plus the same token.
 */
export type ReadSettled =
  | { status: "unchanged"; mtimeMs: number }
  | { status: "absent" }
  | { status: "error" };

/** The result of an on-demand transcript read: a fresh doc, or one of the shared settled outcomes. */
export type TranscriptRead =
  | { status: "changed"; mtimeMs: number; doc: TranscriptDoc }
  | ReadSettled;
