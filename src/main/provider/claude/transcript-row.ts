import type { ContextBreakdown } from "@shared/transcript";

// Row-level helpers shared by the two Claude transcript parsers (transcript.ts and transcript-events.ts).
// Both walk the same JSONL; keeping these in one place stops the number coercion, text extraction, and
// context-size definition from drifting between the summary projection and the render projection.

/** A finite number or 0 — usage fields can be absent or malformed in a half-written transcript line. */
export function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** The cache-creation token split from an assistant `usage` block: the authoritative total
 *  (`cache_creation_input_tokens`) divided into the 5-minute and 1-hour ephemeral buckets
 *  (`cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`). When the `cache_creation`
 *  sub-object is absent (older transcripts, non-Claude sources), or its fields don't sum to the total,
 *  the whole total is attributed to 5m so `fiveM + oneH === total` always holds. Lives here in the
 *  claude/ dir where no-unsafe-* is downgraded: it consumes `any` transcript JSON by design. */
export function cacheCreationSplit(usage: unknown): {
  total: number;
  fiveM: number;
  oneH: number;
} {
  const u = (usage && typeof usage === "object" ? usage : {}) as Record<
    string,
    unknown
  >;
  const total = num(u.cache_creation_input_tokens);
  const cc = u.cache_creation;
  if (cc && typeof cc === "object") {
    const c = cc as Record<string, unknown>;
    const fiveM = num(c.ephemeral_5m_input_tokens);
    const oneH = num(c.ephemeral_1h_input_tokens);
    if (fiveM + oneH === total) return { total, fiveM, oneH };
  }
  return { total, fiveM: total, oneH: 0 };
}

/** The input fields that name a tool call, most-telling first: a shell command, a file path, a search
 *  pattern, a URL, a query, a description. One list so the row's input summary and the modal's command
 *  bar can't disagree on which field identifies a tool. */
export const TELLING_INPUT_KEYS = [
  "command",
  "file_path",
  "path",
  "pattern",
  "url",
  "query",
  "description",
] as const;

/** The first telling input field that holds a non-blank string, or null when none do. Callers layer
 *  their own fallback (the row truncates compact JSON; the modal pretty-prints the whole object). */
export function tellingField(input: Record<string, unknown>): string | null {
  for (const key of TELLING_INPUT_KEYS) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/** A user turn's text whether stored as a plain string or content blocks (text blocks only). */
export function userText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b?.type === "text" && typeof b?.text === "string")
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}

/** The cache-state split of an assistant message's usage — the fresh input, the part read from cache,
 *  and the part newly cached — or null for a zero-sum block (a '<synthetic>' placeholder carries no real
 *  context). The single definition of "current context size" both transcript parsers derive from. */
export function usageBreakdown(usage: unknown): ContextBreakdown | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const input = num(u.input_tokens);
  const cacheRead = num(u.cache_read_input_tokens);
  const cacheCreation = num(u.cache_creation_input_tokens);
  return input + cacheRead + cacheCreation > 0
    ? { input, cacheRead, cacheCreation }
    : null;
}

/** Parse a transcript's JSONL into rows, skipping blank and unparseable lines (a half-written trailing
 *  line during an append is fine). Shared by the subagent reconstruction, which needs raw rows rather
 *  than the event projection. */
export function parseJsonlRows(jsonl: string): any[] {
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

/** A tool_result block's content as flat text — same shape as a user turn's content (a plain string, or
 *  text blocks joined on newline, else ""), so this is {@link userText} under a name that reads right at
 *  a tool_result call site. Used by the render parser (for the output line-count) and the on-demand
 *  tool-result extractor. */
export const toolResultText = userText;

/**
 * Parse JSONL into rows tagged with their absolute 0-based line number, skipping blank and unparseable
 * lines (their line numbers are still consumed, so a blank line never shifts the numbers after it).
 * `startLine` is added to every line index, so parsing only an appended tail yields the same line numbers
 * a whole-file parse would — which keeps an id-less turn's position-stable surrogate key identical across
 * full and incremental reads, so neither double-counts. Like parseJsonlRows, lives in the claude/ dir
 * where no-unsafe-* is downgraded to warn: it consumes `any` transcript JSON by design.
 */
export function parseJsonlRowsAt(
  jsonl: string,
  startLine = 0,
): { row: any; line: number }[] {
  const out: { row: any; line: number }[] = [];
  jsonl.split("\n").forEach((raw, i) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    try {
      out.push({ row: JSON.parse(trimmed), line: startLine + i });
    } catch {
      // skip a malformed / half-written line
    }
  });
  return out;
}
