import type { Usage } from "@shared/types";
import {
  parseRolloutRows,
  promptLabel,
  rowTimestampMs,
  userMessageText,
} from "./rollout";

/** The "what is this session" projection of one Codex rollout — the Codex analogue of the Claude
 *  provider's TranscriptSummary, shaped by what the rollout actually records (see each field). */
export interface CodexRolloutSummary {
  /** session_meta's cwd; "" when the meta line is missing (a truncated head). */
  cwd: string;
  /** session_meta's git.branch, when the session started inside a repo. */
  branch?: string;
  /** The newest turn_context's raw model id (e.g. "gpt-5.5"); undefined before the first turn. */
  modelRaw?: string;
  /** The newest turn_context's reasoning effort (e.g. "xhigh"); Codex's analogue of A6. */
  effortLevel?: string;
  /** The newest reported model_context_window (turn_context / task_started / token_count), so the
   *  context %% is measured against the model's real window, not a Claude family default. */
  contextWindow?: number;
  /** First user prompt (noise-filtered), single-line — the title fallback below the index name. */
  firstPrompt?: string;
  createdMs: number;
  lastActivityMs: number;
  /** Cumulative token usage: the newest token_count's total_token_usage (it is a running total, so
   *  last-wins, no summing). Codex's input_tokens *includes* the cached part; the Usage shape keeps
   *  them disjoint, so cached is subtracted out of input. Cache creation isn't reported — 0. */
  usage: Usage;
  /** The newest token_count's last_token_usage.input_tokens: the full prompt of the latest request,
   *  i.e. the current context size (cached part included, same definition as Claude's). */
  contextTokens: number;
  /** `compacted` rows — how many times this session compacted. */
  compactionCount: number;
}

const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  cacheCreation5mTokens: 0,
  cacheCreation1hTokens: 0,
};

/** A finite non-negative number or null — usage fields can be absent/null in older rollouts. */
function posNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Map a token_count `info.total_token_usage` block into the app's Usage shape (see summary docs). */
function usageFrom(total: any): Usage {
  const input = posNum(total?.input_tokens) ?? 0;
  const cached = posNum(total?.cached_input_tokens) ?? 0;
  return {
    ...EMPTY_USAGE,
    inputTokens: Math.max(0, input - cached),
    outputTokens: posNum(total?.output_tokens) ?? 0,
    cacheReadTokens: cached,
  };
}

/**
 * Reduce a rollout's JSONL into a normalized summary — one pass, line-tolerant (half-written
 * trailing lines skip), mirroring the Claude provider's parseTranscript.
 */
export function parseRolloutSummary(jsonl: string): CodexRolloutSummary {
  let cwd = "";
  let branch: string | undefined;
  let modelRaw: string | undefined;
  let effortLevel: string | undefined;
  let contextWindow: number | undefined;
  let firstPrompt: string | undefined;
  let createdMs = 0;
  let lastActivityMs = 0;
  let usage = EMPTY_USAGE;
  let contextTokens = 0;
  let compactionCount = 0;

  for (const row of parseRolloutRows(jsonl)) {
    const ts = rowTimestampMs(row);
    if (ts !== null) {
      if (ts > lastActivityMs) lastActivityMs = ts;
      if (createdMs === 0 || ts < createdMs) createdMs = ts;
    }

    const payload = row?.payload;
    if (!payload || typeof payload !== "object") continue;

    if (row.type === "session_meta") {
      if (typeof payload.cwd === "string" && payload.cwd) cwd = payload.cwd;
      const gitBranch = payload.git?.branch;
      if (typeof gitBranch === "string" && gitBranch) branch = gitBranch;
      continue;
    }

    if (row.type === "turn_context") {
      // Newest wins: a /model mid-session should relabel the session, like Claude's lastModelRaw.
      if (typeof payload.model === "string" && payload.model)
        modelRaw = payload.model;
      if (typeof payload.effort === "string" && payload.effort)
        effortLevel = payload.effort;
      // turn_context carries no cwd surprise-free fallback: some rollouts record cwd here too.
      if (!cwd && typeof payload.cwd === "string" && payload.cwd)
        cwd = payload.cwd;
      continue;
    }

    if (row.type === "compacted") {
      compactionCount++;
      continue;
    }

    if (row.type === "event_msg") {
      if (payload.type === "task_started") {
        const win = posNum(payload.model_context_window);
        if (win) contextWindow = win;
      } else if (payload.type === "token_count") {
        // `info` is null on rate-limit-only samples; only a real usage block moves the totals.
        const info = payload.info;
        if (info && typeof info === "object") {
          if (info.total_token_usage) usage = usageFrom(info.total_token_usage);
          const lastInput = posNum(info.last_token_usage?.input_tokens);
          if (lastInput !== null) contextTokens = lastInput;
          const win = posNum(info.model_context_window);
          if (win) contextWindow = win;
        }
      }
      continue;
    }

    if (
      row.type === "response_item" &&
      payload.type === "message" &&
      payload.role === "user" &&
      firstPrompt === undefined
    ) {
      const text = userMessageText(payload.content);
      if (text) {
        const label = promptLabel(text);
        if (label) firstPrompt = label;
      }
    }
  }

  return {
    cwd,
    branch,
    modelRaw,
    effortLevel,
    contextWindow,
    firstPrompt,
    createdMs,
    lastActivityMs,
    usage,
    contextTokens,
    compactionCount,
  };
}

/**
 * The session's cwd without a full parse: the first row whose payload carries one (session_meta is
 * line 1; turn_context repeats it). The Codex analogue of firstTranscriptCwd — Open-in only needs
 * the folder, not token totals over a possibly-large file. "" when no row resolves one.
 */
export function firstRolloutCwd(jsonl: string): string {
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed);
      const cwd = row?.payload?.cwd;
      if (typeof cwd === "string" && cwd) return cwd;
    } catch {
      // skip a half-written or malformed line
    }
  }
  return "";
}
