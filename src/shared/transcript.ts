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
  | {
      kind: "tool";
      /** The tool name, e.g. "Bash". */
      name: string;
      /** One-line summary of the input for the row (the command / path / pattern, truncated by the UI). */
      input: string;
      /** The tool_use id, used to fetch the full command + output on demand. "" when the row had no id. */
      toolUseId: string;
      /** Resolved from the tool_result's error flag: "ok" passed, "error" failed, "pending" no result yet. */
      status: "ok" | "error" | "pending";
      /** Exact line count of the captured output, 0 when empty or still pending. */
      outputLines: number;
    }
  | {
      kind: "diff";
      tool: string;
      file: string;
      hunk: DiffHunk;
      /** Resolved from the tool_result's error flag, like the tool variant: "ok" the edit applied,
       *  "error" it failed (e.g. old_string not found), "pending" no result yet. */
      status: "ok" | "error" | "pending";
    }
  | {
      kind: "subagent";
      agentType: string;
      description: string;
      toolUseId: string;
    };

/** The tool-call event variant, named for reuse across the renderer (the row, the feed, the modal). */
export type ToolEvent = Extract<TranscriptEvent, { kind: "tool" }>;

/** The edit-event variant (Edit / Write / MultiEdit), named for reuse across the renderer's diff row and
 *  diff modal. */
export type DiffEvent = Extract<TranscriptEvent, { kind: "diff" }>;

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

/**
 * The wire form of a TranscriptRead, used everywhere a doc crosses a process boundary. A changed
 * doc travels as ONE JSON string instead of a structured-clone object tree: deserializing a string
 * is a memcpy, so the main process can relay a tens-of-MB doc from the parse worker to the renderer
 * without an O(doc) decode on its thread. The string is parsed back into a TranscriptDoc only in the
 * renderer (preload), where it lands anyway.
 */
export type TranscriptReadWire =
  | { status: "changed"; mtimeMs: number; docJson: string }
  | ReadSettled;

/** Serialize a read for the wire. Called where the doc was parsed (the worker, or main only on the
 *  in-process fallback path), so the stringify cost lands off the main thread in the steady state. */
export function toTranscriptWire(read: TranscriptRead): TranscriptReadWire {
  if (read.status !== "changed") return read;
  return {
    status: "changed",
    mtimeMs: read.mtimeMs,
    docJson: JSON.stringify(read.doc),
  };
}

/** Parse a wire read back into the domain shape — the renderer-side (preload) half of the relay.
 *  A malformed docJson degrades to `error` (keep the last doc and retry), never a throw. */
export function fromTranscriptWire(wire: TranscriptReadWire): TranscriptRead {
  if (wire.status !== "changed") return wire;
  try {
    return {
      status: "changed",
      mtimeMs: wire.mtimeMs,
      doc: JSON.parse(wire.docJson) as TranscriptDoc,
    };
  } catch {
    return { status: "error" };
  }
}

/** The on-demand detail behind a tool row: the full command, the complete captured output, and the
 *  status read from the result block ("pending" when the result hasn't landed yet). Read fresh from disk
 *  on each fetch, so the modal trusts this over the row event's status, which can lag a poll behind.
 *  `found: false` when the transcript moved or the id has no tool_use block. */
export type ToolResultDetail =
  | {
      found: true;
      command: string;
      output: string;
      status: "ok" | "error" | "pending";
    }
  | { found: false };
