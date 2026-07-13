import type {
  ContextBreakdown,
  DiffEvent,
  DiffHunk,
  ToolEvent,
  ToolResultDetail,
  TranscriptDoc,
  TranscriptEvent,
  TurnSummary,
} from "@shared/transcript";
import {
  assistantMessageText,
  promptLabel,
  rowTimestampMs,
  toolOutputStatus,
  toolOutputText,
  userMessageText,
} from "./rollout";

/**
 * Project parsed rollout rows into the app's render-ready transcript shape — the same TranscriptDoc
 * the Claude parser produces, so the Observed TranscriptView renders a Codex session unchanged.
 * Pure: same rows, same output.
 *
 * Mapping (verified against real rollouts on this machine):
 *  - response_item message user       → user event (developer role dropped; injected noise filtered)
 *  - response_item message assistant  → assistant event (commentary and final answers both)
 *  - response_item reasoning          → thinking event from `summary[].text` (the encrypted body is
 *                                       unreadable by design and is not surfaced)
 *  - response_item function_call /
 *    custom_tool_call                 → tool event; `apply_patch` renders as a diff event
 *  - *_call_output                    → back-patches the matching call's status + output line count
 *  - event_msg token_count            → the current-context split (cached vs fresh input)
 *  - event_msg user_message /
 *    agent_message                    → skipped: duplicates of the response_item rows above
 *
 * waitingReason stays null: observe-only v1 has no honest signal that a Codex session is blocked on
 * its user (no tool_use-without-result contract like Claude's).
 */
export function parseRolloutEvents(
  rows: any[],
): Omit<TranscriptDoc, "subagents"> {
  const events: TranscriptEvent[] = [];
  const byCallId = new Map<string, ToolEvent | DiffEvent>();
  let context: ContextBreakdown | null = null;

  // Timeline accumulators — the same open/finalize dance as the Claude parser: a real user prompt
  // opens a turn, every timestamped row extends its clock, the next prompt (or EOF) closes it.
  const turns: TurnSummary[] = [];
  let open: TurnSummary | null = null;
  const finalizeOpen = (): void => {
    if (!open) return;
    open.durationMs = Math.max(0, open.endMs - open.startMs);
    turns.push(open);
    open = null;
  };
  const extendClock = (ts: number | null): void => {
    if (open && ts !== null) open.endMs = Math.max(open.endMs, ts);
  };

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const payload = row.payload;
    if (!payload || typeof payload !== "object") continue;
    const ts = rowTimestampMs(row);

    if (row.type === "event_msg") {
      if (payload.type === "token_count") {
        const last = payload.info?.last_token_usage;
        const input =
          typeof last?.input_tokens === "number" ? last.input_tokens : null;
        if (input !== null) {
          const cached =
            typeof last?.cached_input_tokens === "number"
              ? last.cached_input_tokens
              : 0;
          // Codex's input_tokens includes the cached part; the split keeps them disjoint so
          // input + cacheRead reproduces the full prompt (cache creation isn't reported — 0).
          context = {
            input: Math.max(0, input - cached),
            cacheRead: cached,
            cacheCreation: 0,
          };
        }
      }
      extendClock(ts);
      continue;
    }

    if (row.type !== "response_item") {
      extendClock(ts);
      continue;
    }

    switch (payload.type) {
      case "message": {
        if (payload.role === "assistant") {
          const text = assistantMessageText(payload.content);
          if (text) events.push({ kind: "assistant", text });
          extendClock(ts);
        } else if (payload.role === "user") {
          const text = userMessageText(payload.content);
          if (text) {
            // A real user prompt closes the previous turn and opens a new one.
            finalizeOpen();
            const start = ts ?? 0;
            open = {
              index: turns.length + 1,
              prompt: promptLabel(text),
              startMs: start,
              endMs: start,
              durationMs: 0,
              toolCount: 0,
            };
            events.push({ kind: "user", text });
          } else {
            extendClock(ts); // an injection-only row still belongs to the current turn's clock
          }
        }
        // role "developer" (permissions preambles, agent-team plumbing) is dropped wholesale.
        break;
      }
      case "reasoning": {
        // Only the plaintext summary is renderable; the body ships encrypted.
        if (Array.isArray(payload.summary)) {
          for (const s of payload.summary) {
            if (typeof s?.text === "string" && s.text.trim())
              events.push({ kind: "thinking", text: s.text });
          }
        }
        extendClock(ts);
        break;
      }
      case "function_call":
      case "custom_tool_call": {
        if (open) open.toolCount++;
        const callId =
          typeof payload.call_id === "string" ? payload.call_id : "";
        const name = typeof payload.name === "string" ? payload.name : "tool";
        if (name === "apply_patch") {
          const { file, hunk } = parsePatch(rawToolInput(payload));
          const diffEvent: DiffEvent = {
            kind: "diff",
            tool: "apply_patch",
            file,
            hunk,
            status: "pending",
          };
          events.push(diffEvent);
          if (callId) byCallId.set(callId, diffEvent);
        } else {
          const toolEvent: ToolEvent = {
            kind: "tool",
            name,
            input: summarizeToolInput(payload),
            toolUseId: callId,
            status: "pending",
            outputLines: 0,
          };
          events.push(toolEvent);
          if (callId) byCallId.set(callId, toolEvent);
        }
        extendClock(ts);
        break;
      }
      case "function_call_output":
      case "custom_tool_call_output": {
        const callId =
          typeof payload.call_id === "string" ? payload.call_id : "";
        const ev = byCallId.get(callId);
        if (ev) {
          const text = toolOutputText(payload.output);
          ev.status = toolOutputStatus(text);
          if (ev.kind === "tool") {
            ev.outputLines = text
              ? text.replace(/\n$/, "").split("\n").length
              : 0;
          }
        }
        extendClock(ts);
        break;
      }
      default:
        extendClock(ts); // web_search_call, tool_search_call, … — nothing renderable yet
    }
  }

  finalizeOpen();

  return { events, waitingReason: null, turns, context };
}

/** A tool call's raw input text: function_call carries JSON `arguments`, custom_tool_call a plain
 *  `input` string (a patch, or freeform tool code). */
function rawToolInput(payload: any): string {
  if (typeof payload.input === "string") return payload.input;
  if (typeof payload.arguments === "string") return payload.arguments;
  return "";
}

/** A short human label for a tool call's input: the shell command when the arguments carry one
 *  (`cmd` string or `command` array — both observed), else the first line of the raw input. */
function summarizeToolInput(payload: any): string {
  const raw = rawToolInput(payload);
  if (typeof payload.arguments === "string") {
    try {
      const args = JSON.parse(payload.arguments);
      if (typeof args?.cmd === "string" && args.cmd) return truncate(args.cmd);
      if (Array.isArray(args?.command)) return truncate(args.command.join(" "));
    } catch {
      // fall through to the raw text
    }
  }
  const firstLine = raw.split("\n").find((l) => l.trim()) ?? "";
  return truncate(firstLine.trim());
}

function truncate(s: string): string {
  return s.length > 200 ? s.slice(0, 199) + "…" : s;
}

/**
 * apply_patch's input into the app's diff shape. The format is Codex's own envelope:
 * `*** Begin Patch` / `*** Update|Add|Delete File: <path>` headers, then unified-diff-ish bodies
 * where `+`/`-` prefix added/removed lines and everything else is context. A multi-file patch keeps
 * the first file as the row's label; all hunks fold into one added/removed pair (the DiffModal shows
 * the full input on demand via getToolResult).
 */
function parsePatch(patch: string): { file: string; hunk: DiffHunk } {
  let file = "";
  const removed: string[] = [];
  const added: string[] = [];
  for (const line of patch.split("\n")) {
    const header = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/.exec(line);
    if (header) {
      if (!file) file = header[1].trim();
      continue;
    }
    if (line.startsWith("***") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) added.push(line.slice(1));
    else if (line.startsWith("-")) removed.push(line.slice(1));
  }
  return { file, hunk: { removed, added } };
}

/**
 * The on-demand detail behind a tool row: the call's full input and its complete captured output,
 * matched by call_id over freshly-parsed rows — the Codex analogue of the Claude extractToolResult.
 */
export function extractRolloutToolResult(
  rows: any[],
  toolUseId: string,
): ToolResultDetail {
  if (!toolUseId) return { found: false };
  let command: string | null = null;
  let output: string | null = null;
  for (const row of rows) {
    const payload = row?.payload;
    if (
      row?.type !== "response_item" ||
      !payload ||
      typeof payload !== "object"
    )
      continue;
    if (payload.call_id !== toolUseId) continue;
    if (
      payload.type === "function_call" ||
      payload.type === "custom_tool_call"
    ) {
      command = rawToolInput(payload);
    } else if (
      payload.type === "function_call_output" ||
      payload.type === "custom_tool_call_output"
    ) {
      output = toolOutputText(payload.output);
    }
  }
  if (command === null) return { found: false };
  return {
    found: true,
    command,
    output: output ?? "",
    status: output === null ? "pending" : toolOutputStatus(output),
  };
}
