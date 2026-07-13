/**
 * Row-level helpers shared by the two Codex rollout parsers (summary.ts and events.ts). A rollout is
 * JSONL, one `{timestamp, type, payload}` per line; both parsers walk the same rows, so the line
 * parsing, text extraction, and prompt-noise filter live here once — the same split the Claude
 * provider keeps in transcript-row.ts. Consumes `any` from external JSON by design (the repo-wide
 * no-unsafe-* downgrade exists for exactly this).
 */

/** Parse a rollout's JSONL into rows, skipping blank and unparseable lines — a rollout being
 *  appended to right now (a half-written trailing line) is fine, matching the Claude parser. */
export function parseRolloutRows(jsonl: string): any[] {
  const rows: any[] = [];
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // skip a malformed / half-written line
    }
  }
  return rows;
}

/** A row's epoch-ms timestamp, or null when absent/unparseable. */
export function rowTimestampMs(row: any): number | null {
  if (typeof row?.timestamp !== "string") return null;
  const ms = Date.parse(row.timestamp);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Prefixes of injected user-role blocks that are harness plumbing, not conversation — observed on
 * disk: the AGENTS.md injection, the environment/permissions preambles, and config instructions all
 * arrive as `role:"user"` input_text blocks ahead of (or beside) the real prompt. Filtered the way
 * the Claude parser drops isMeta/system noise, so the transcript view opens on what the user typed.
 * (`role:"developer"` rows are dropped wholesale before this list is consulted.)
 */
const NOISE_PREFIXES = [
  "# AGENTS.md instructions",
  "<environment_context>",
  "<permissions instructions>",
  "<user_instructions>",
  "<personality_spec",
  "<multi_agent_mode",
  "<turn_aborted",
];

/** Whether an input_text block is injected harness plumbing rather than something the user typed. */
export function isNoiseUserText(text: string): boolean {
  const t = text.trimStart();
  return NOISE_PREFIXES.some((p) => t.startsWith(p));
}

/** The human-typed text of a user message row: its input_text blocks minus injected noise, joined.
 *  "" when nothing human remains (a pure AGENTS.md/environment injection row). */
export function userMessageText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const b of content) {
    if (b?.type !== "input_text" || typeof b.text !== "string") continue;
    if (!b.text.trim() || isNoiseUserText(b.text)) continue;
    parts.push(b.text);
  }
  return parts.join("\n\n");
}

/** The visible text of an assistant message row: its output_text blocks joined. Codex writes both
 *  `commentary` (progress updates) and final-answer messages as assistant rows; both are shown. */
export function assistantMessageText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const b of content) {
    if (
      b?.type === "output_text" &&
      typeof b.text === "string" &&
      b.text.trim()
    )
      parts.push(b.text);
  }
  return parts.join("\n\n");
}

/** A tool output payload's text: a plain string, or `{text}` blocks joined — Codex uses the string
 *  form for function_call_output and the block-array form for custom_tool_call_output. */
export function toolOutputText(output: unknown): string {
  if (typeof output === "string") return output;
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const b of output) {
    if (typeof b?.text === "string") parts.push(b.text);
  }
  return parts.join("");
}

/** A single-line label for a user prompt (the title fallback / turn label): its first non-empty
 *  line, capped so a pasted wall of text can't blow up the rail. */
export function promptLabel(text: string): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  const trimmed = line.trim();
  return trimmed.length > 120 ? trimmed.slice(0, 119) + "…" : trimmed;
}

/** Exit-code scrape for a tool output's status. Codex tool outputs carry no error flag; the shell
 *  wrappers print "Process exited with code N" (or "exited with code N") in the head, so a non-zero
 *  N is the only honest failure signal available. No match reads as ok — an output landed. */
export function toolOutputStatus(text: string): "ok" | "error" {
  const m = /exited with code (\d+)/i.exec(text.slice(0, 500));
  return m && Number(m[1]) !== 0 ? "error" : "ok";
}
