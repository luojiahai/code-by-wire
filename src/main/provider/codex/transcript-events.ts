import type { TranscriptDoc, TranscriptEvent } from "@shared/transcript";
import { asRecord } from "./rollout";

/** Exact prefixes of injected-context user items (codex's environment_context / user_instructions
 *  protocol constants, plus the plugin advertisement): machine context, never a typed prompt. A
 *  real prompt that merely starts with "<" is kept — this is a closed list, not a "<" heuristic. */
const CONTEXT_PREFIXES = [
  "<environment_context>",
  "<user_instructions>",
  "<recommended_plugins>",
] as const;

/** Join the text of a content value: a bare string passes through; an array contributes every
 *  item's `text` (input_text / output_text / summary_text / reasoning_text all carry one). */
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    const r = asRecord(item);
    if (r && typeof r.text === "string" && r.text) parts.push(r.text);
  }
  return parts.join("\n");
}

/**
 * Project a rollout's JSONL into render-ready events — the codex analog of claude's
 * parseTranscriptEvents, targeting the same shared doc so the renderer needs no codex wiring.
 *
 * Renders from response_item lines only: in legacy history mode every user prompt and assistant
 * message ALSO lands as an event_msg (user_message / agent_message), so rendering both streams
 * would double the conversation. session_meta, turn_context, world_state, compacted,
 * inter_agent_* and unknown line types are skipped. Tolerant by design, like the head parser in
 * rollout.ts: no line shape may throw, and a half-written trailing line during an append is fine.
 */
export function parseRolloutEvents(
  jsonl: string,
): Omit<TranscriptDoc, "subagents"> {
  const events: TranscriptEvent[] = [];

  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, unknown> | null;
    try {
      row = asRecord(JSON.parse(line));
    } catch {
      continue; // malformed / half-written line
    }
    if (!row) continue;
    const payload = asRecord(row.payload);
    if (!payload) continue;
    if (row.type !== "response_item") continue;

    const kind = payload.type;
    if (kind === "message") {
      if (payload.role === "user") {
        const text = contentText(payload.content).trim();
        if (!text || CONTEXT_PREFIXES.some((p) => text.startsWith(p))) continue;
        events.push({ kind: "user", text });
      } else if (payload.role === "assistant") {
        const text = contentText(payload.content);
        if (text.trim()) events.push({ kind: "assistant", text });
      }
      // developer (permissions / multi-agent role prompts) and unknown roles: injected context
      continue;
    }
    if (kind === "reasoning") {
      // Summary + optional plaintext content; encrypted_content alone renders nothing.
      const text = [contentText(payload.summary), contentText(payload.content)]
        .filter(Boolean)
        .join("\n");
      if (text.trim()) events.push({ kind: "thinking", text });
      continue;
    }
  }

  return { events, waitingReason: null, turns: [], context: null };
}
