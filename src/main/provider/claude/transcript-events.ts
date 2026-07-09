import type {
  DiffEvent,
  DiffHunk,
  ToolEvent,
  TranscriptDoc,
  TranscriptEvent,
  TurnSummary,
} from "@shared/transcript";
import {
  extractCommandName,
  promptLabel,
  stripCommandEnvelope,
} from "./command-envelope";
import {
  parseJsonlRows,
  userText,
  toolResultText,
  tellingField,
} from "./transcript-row";
import { createTailTracker } from "./transcript-tail";

/** Tools whose edit we render as a diff rather than a generic tool call. */
const DIFF_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);
/** Tools that dispatch a subagent. */
const SUBAGENT_TOOLS = new Set(["Task", "Agent"]);

/** Split a possibly-multiline string into lines; a non-string or '' → [] so that side renders nothing. */
function lines(s: unknown): string[] {
  return typeof s === "string" && s.length ? s.split("\n") : [];
}

/** A short, human label for a tool call's input: the most telling field, else compact JSON. */
function summarizeInput(input: Record<string, unknown>): string {
  const field = tellingField(input);
  if (field !== null) return field;
  try {
    const json = JSON.stringify(input);
    return json.length > 200 ? json.slice(0, 199) + "…" : json;
  } catch {
    return "";
  }
}

/** The removed/added lines for an edit tool's input (Edit / Write / MultiEdit). */
function diffHunk(tool: string, input: Record<string, unknown>): DiffHunk {
  if (tool === "Write") return { removed: [], added: lines(input.content) };
  if (tool === "MultiEdit" && Array.isArray(input.edits)) {
    const removed: string[] = [];
    const added: string[] = [];
    for (const e of input.edits) {
      removed.push(...lines(e?.old_string));
      added.push(...lines(e?.new_string));
    }
    return { removed, added };
  }
  return { removed: lines(input.old_string), added: lines(input.new_string) };
}

/**
 * Project parsed transcript rows into render-ready events, a waiting reason, a turn-by-turn timeline, and
 * the current context's cache-state split — all in one pass. Pure: same input, same output. Subagent-
 * internal turns (isSidechain) are dropped by default (set includeSidechain to render a subagent's own
 * file) — the dispatch is surfaced from the parent's Task tool_use, and a subagent's own tools/time
 * don't count toward the parent turn. The read parses the JSONL once
 * (see parseTranscriptEvents) and feeds the same rows here and to the subagent reconstruction.
 */
export function parseTranscriptEventsFromRows(
  rows: any[],
  opts: { includeSidechain?: boolean } = {},
): Omit<TranscriptDoc, "subagents"> {
  const { includeSidechain = false } = opts;
  const events: TranscriptEvent[] = [];
  const tail = createTailTracker();
  // Tool and edit (diff) events keyed by tool_use id, so the matching tool_result (a later user row) can
  // back-patch their status — and, for tool events, the output line count. Subagent dispatches resolve
  // their own way and aren't tracked here.
  const byToolUseId = new Map<string, ToolEvent | DiffEvent>();

  // Timeline accumulators. `open` is the turn being built (a user prompt and the assistant work up to
  // the next prompt); finalized into `turns` on the next prompt and at EOF.
  const turns: TurnSummary[] = [];
  let open: TurnSummary | null = null;
  let lastTs = 0; // most recent valid timestamp; a fallback for a row that lacks one
  let sawTs = false; // has any row carried a parseable timestamp yet?
  let openStartPending = false; // the open turn began before any timestamp existed; adopt the first one

  const finalizeOpen = (): void => {
    if (!open) return;
    open.durationMs = Math.max(0, open.endMs - open.startMs);
    turns.push(open);
    open = null;
  };

  // Extend the open turn's clock to a row's timestamp. A turn that opened before any timestamp existed
  // adopts the first one as its start — so a missing leading timestamp can't leave startMs at epoch 0
  // while a later real timestamp inflates the duration (and the "ago" readout) to ~50000 years.
  const extendClock = (ts: number): void => {
    if (!open) return;
    if (openStartPending) {
      open.startMs = ts;
      openStartPending = false;
    }
    open.endMs = Math.max(open.endMs, ts);
  };

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    // A subagent-internal turn: dropped for the Session view, kept when rendering a subagent's own file.
    if (!includeSidechain && row.isSidechain) continue;

    const tsParsed =
      typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    const hasTs = !Number.isNaN(tsParsed);
    if (hasTs) {
      lastTs = tsParsed;
      sawTs = true;
    }

    const content = row.message?.content;

    if (row.type === "user") {
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b?.type === "tool_result" && typeof b.tool_use_id === "string") {
            tail.resolveToolResult(b.tool_use_id);
            const ev = byToolUseId.get(b.tool_use_id);
            if (ev) {
              ev.status = b.is_error === true ? "error" : "ok";
              if (ev.kind === "tool") {
                const text = toolResultText(b.content);
                ev.outputLines = text
                  ? text.replace(/\n$/, "").split("\n").length
                  : 0;
              }
            }
          }
        }
      }
      if (row.isMeta) {
        if (hasTs) extendClock(tsParsed);
        continue;
      }
      const raw = userText(content);
      if (raw) {
        // A real user prompt closes the previous turn and opens a new one.
        finalizeOpen();
        const start = hasTs ? tsParsed : lastTs;
        open = {
          index: turns.length + 1,
          prompt: promptLabel(raw),
          startMs: start,
          endMs: start,
          durationMs: 0,
          toolCount: 0,
        };
        openStartPending = !hasTs && !sawTs;
        const command = extractCommandName(raw);
        events.push({
          kind: "user",
          text: command || stripCommandEnvelope(raw).trim(),
        });
        continue;
      }
      // A tool_result-only (or empty) user turn belongs to the current turn — extend its clock.
      if (hasTs) extendClock(tsParsed);
      continue;
    }

    if (row.type === "assistant") {
      // A new turn (new message.id) supersedes the last; only its own tools can still block. An id-less
      // row is treated as its own turn.
      const id =
        typeof row.message?.id === "string" ? row.message.id : undefined;
      tail.beginAssistantTurn(id);
      if (hasTs) extendClock(tsParsed);

      // Current context = the latest assistant turn's prompt, split by cache state. An API-error
      // row's partial usage is not a real context split — skip it (matches the summary parser).
      if (!row.isApiErrorMessage) tail.noteUsage(row.message?.usage);

      if (!Array.isArray(content)) continue;
      for (const b of content) {
        if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) {
          events.push({ kind: "assistant", text: b.text });
        } else if (
          b?.type === "thinking" &&
          typeof b.thinking === "string" &&
          b.thinking.trim()
        ) {
          events.push({ kind: "thinking", text: b.thinking });
        } else if (b?.type === "tool_use" && typeof b.name === "string") {
          if (open) open.toolCount++;
          const input = (
            b.input && typeof b.input === "object" ? b.input : {}
          ) as Record<string, unknown>;
          if (SUBAGENT_TOOLS.has(b.name)) {
            events.push({
              kind: "subagent",
              agentType:
                typeof input.subagent_type === "string"
                  ? input.subagent_type
                  : b.name,
              description:
                typeof input.description === "string" ? input.description : "",
              toolUseId: typeof b.id === "string" ? b.id : "",
            });
          } else if (DIFF_TOOLS.has(b.name)) {
            const toolUseId = typeof b.id === "string" ? b.id : "";
            const diffEvent: DiffEvent = {
              kind: "diff",
              tool: b.name,
              file: typeof input.file_path === "string" ? input.file_path : "",
              hunk: diffHunk(b.name, input),
              status: "pending",
            };
            events.push(diffEvent);
            if (toolUseId) byToolUseId.set(toolUseId, diffEvent);
          } else {
            const toolUseId = typeof b.id === "string" ? b.id : "";
            const toolEvent: ToolEvent = {
              kind: "tool",
              name: b.name,
              input: summarizeInput(input),
              toolUseId,
              status: "pending",
              outputLines: 0,
            };
            events.push(toolEvent);
            if (toolUseId) byToolUseId.set(toolUseId, toolEvent);
          }
          if (typeof b.id === "string") tail.noteToolUse(b.id, b.name, input);
        }
      }
    }
  }

  finalizeOpen();

  return {
    events,
    waitingReason: tail.waitingReason(),
    turns,
    context: tail.context,
  };
}

/** Parse a transcript's JSONL and project it (see parseTranscriptEventsFromRows). Skips blank and
 *  unparseable lines, so a half-written trailing line during an append is fine. */
export function parseTranscriptEvents(
  jsonl: string,
  opts?: { includeSidechain?: boolean },
): Omit<TranscriptDoc, "subagents"> {
  return parseTranscriptEventsFromRows(parseJsonlRows(jsonl), opts);
}
