import type { ContextBreakdown } from "@shared/transcript";
import { usageBreakdown } from "./transcript-row";

/** A pending tool_use's reason and whether it's a direct question to the user. */
export interface PendingReason {
  reason: string;
  question: boolean;
}

/** A waiting reason for one unanswered tool_use: the question(s) for AskUserQuestion, else a permission
 *  line naming the pending tool. */
export function reasonForTool(
  name: string,
  input: Record<string, unknown>,
): PendingReason {
  if (name === "AskUserQuestion") {
    const qs = Array.isArray(input.questions)
      ? input.questions
          .map((q) => (typeof q?.question === "string" ? q.question : ""))
          .filter(Boolean)
      : [];
    return {
      reason: qs.length ? qs.join(" · ") : "Waiting on a question",
      question: true,
    };
  }
  return { reason: `Permission: ${name}`, question: false };
}

/**
 * The shared tail state machine both Claude transcript parsers drive: which tool_use blocks from the
 * LATEST assistant turn remain unanswered (the Waiting signal), and the latest turn's context cache-state
 * split (the current context size). One definition so the summary and render projections can't drift.
 *
 * A new assistant turn (new message.id) supersedes the last, so only its own tools can still block. An
 * id-less assistant row is its own turn (resets every time), matching both parsers' prior behavior. A
 * zero-sum usage block (a '<synthetic>' placeholder) leaves the last real split intact.
 *
 * Which rows reach the tracker is the caller's decision: the render parser excludes isSidechain
 * (subagent-internal) turns, the summary parser includes every row.
 */
export interface TailTracker {
  beginAssistantTurn(id: string | undefined): void;
  noteUsage(usage: unknown): void;
  noteToolUse(id: string, name: string, input: Record<string, unknown>): void;
  resolveToolResult(id: string): void;
  readonly awaitingUser: boolean;
  readonly context: ContextBreakdown | null;
  /** The surfaced reason: the actual question when a turn blocks on several tools at once, else the first
   *  pending tool in turn order. null when nothing is pending. */
  waitingReason(): string | null;
}

export function createTailTracker(): TailTracker {
  let pending = new Map<string, PendingReason>();
  let turn: string | undefined;
  let context: ContextBreakdown | null = null;
  return {
    beginAssistantTurn(id) {
      if (id === undefined || id !== turn) {
        pending = new Map();
        turn = id;
      }
    },
    noteUsage(usage) {
      const bd = usageBreakdown(usage);
      if (bd) context = bd;
    },
    noteToolUse(id, name, input) {
      pending.set(id, reasonForTool(name, input));
    },
    resolveToolResult(id) {
      pending.delete(id);
    },
    get awaitingUser() {
      return pending.size > 0;
    },
    get context() {
      return context;
    },
    waitingReason() {
      let pick: PendingReason | undefined;
      for (const r of pending.values()) {
        if (!pick) pick = r;
        if (r.question) {
          pick = r;
          break;
        }
      }
      return pick?.reason ?? null;
    },
  };
}
