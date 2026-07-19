import type { ToolResultDetail } from "@shared/transcript";
import { asRecord } from "./rollout";
import {
  TOOL_CALL_NAMES,
  TOOL_OUTPUT_TYPES,
  toolCommand,
  normalizeOutput,
} from "./transcript-events";

/**
 * Pull one tool call's full detail out of a rollout: the command from its call item, the complete
 * output + status from the matching *_output item, paired by call_id. `found: false` when no call
 * carries the id (a vanished/rewritten rollout, or an id-less row like web_search_call). A call
 * whose output hasn't landed is `status: "pending"` with empty output, so a still-running command
 * opens in the modal. Read fresh on every fetch, so the status is the on-disk truth. Pure —
 * unit-tested without IO. The codex analog of claude/tool-result.ts, over rollout lines.
 */
export function extractToolResult(
  jsonl: string,
  toolUseId: string,
): ToolResultDetail {
  if (!toolUseId) return { found: false };
  let command: string | null = null;
  let output = "";
  let status: "ok" | "error" | "pending" = "pending";
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, unknown> | null;
    try {
      row = asRecord(JSON.parse(line));
    } catch {
      continue;
    }
    const payload =
      row && row.type === "response_item" ? asRecord(row.payload) : null;
    if (!payload || payload.call_id !== toolUseId) continue;
    const kind = typeof payload.type === "string" ? payload.type : "";
    if (TOOL_CALL_NAMES.has(kind)) {
      command = toolCommand(payload);
    } else if (TOOL_OUTPUT_TYPES.has(kind)) {
      const r = normalizeOutput(payload.output);
      output = r.text;
      status = r.error ? "error" : "ok";
    }
  }
  if (command === null) return { found: false };
  return { found: true, command, output, status };
}
