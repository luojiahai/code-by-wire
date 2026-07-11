import { closeSync, openSync, readSync } from "node:fs";
import { basename } from "node:path";
import { normalizeModelId, type Family } from "@shared/models";
import type { Usage } from "@shared/types";
import { contextTotal } from "@shared/context";
import { promptLabel } from "./command-envelope";
import { userText } from "./transcript-row";
import { createTailTracker } from "./transcript-tail";
import { UsageAccumulator } from "./usage-accumulator";

export interface TranscriptSummary {
  title: string;
  project: string;
  cwd: string;
  branch?: string;
  model: Family;
  /** The last assistant turn's raw `message.model`, before normalization. Undefined when no turn
   *  reported a model. */
  modelRaw?: string;
  lastActivityMs: number;
  /** Session creation time (epoch ms): the earliest parseable transcript timestamp. 0 when no row
   *  carried one. The rail's Active list sorts on this so a row doesn't move as the session works. */
  createdMs: number;
  /** The last turn left a question or permission prompt unanswered (a tool_use with no result). */
  awaitingUser: boolean;
  /** Token usage summed across the transcript's assistant turns. */
  usage: Usage;
  /** Latest turn's full prompt (input + cache-read + cache-creation): the current context size, for context %. */
  contextTokens: number;
  /** Thinking effort scanned from `/effort` / `/model` stdout markers, newest wins (A6). Absent
   *  when the transcript carries none — the capture, then settings.json, layer above/below this. */
  effortLevel?: string;
  /** Non-sidechain compact_boundary rows (A9): how many times this session compacted. */
  compactionCount: number;
  /** Σ max(0, preTokens − postTokens) across boundaries whose compactMetadata carried both. */
  compactionTokensReclaimed: number;
}

/** The transcript-derived title: the newest `custom-title` entry (a `/rename` persisted into the
 *  transcript — A7), else the first non-empty user prompt (slash commands shown by name), else the
 *  project basename. A live capture's session_name and the user's own rename override layer above. */
export function deriveTitle(
  userPrompts: string[],
  cwd: string,
  customTitle?: string,
): string {
  const custom = customTitle?.trim();
  if (custom) return custom;
  for (const raw of userPrompts) {
    const label = promptLabel(raw);
    if (label) return label;
  }
  return basename(cwd) || "session";
}

/**
 * The session's cwd without a full parse. Claude records `cwd` on every transcript row, so the first
 * parseable row that carries one wins — Adopt only needs where to relaunch, and a full parseTranscript
 * (token counting, tool_use tracking, prompt extraction over every line) on a possibly-large file is
 * waste when one field on row 1 answers it. '' when no row resolves a cwd.
 */
export function firstTranscriptCwd(jsonl: string): string {
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed);
      if (typeof row.cwd === "string" && row.cwd) return row.cwd;
    } catch {
      // skip a half-written or malformed line, same as parseTranscript
    }
  }
  return "";
}

/**
 * How much of a transcript's head we scan for `sessionKind`. The field lands within the first few JSONL
 * lines (the short metadata preamble, then the first attachment/turn line), so this only needs to clear
 * that preamble plus a large first turn — a backstop, not a tuning knob. It is bounded because an
 * interactive transcript never carries the field: without a cap, a whole-file scan would read a
 * possibly-multi-MB file to the end looking for something that isn't there. The residual cost of the
 * cap: a bg transcript whose first `sessionKind`-bearing line is itself larger than this is truncated
 * (won't parse) and missed, so that pathological bg session can resurface. 256 KiB clears the preamble
 * plus any realistic first line (a large pasted prompt or attachment).
 */
const SESSION_KIND_SCAN_BYTES = 256 * 1024;

/**
 * The transcript's `sessionKind` ("bg" for a Claude background session), read from a bounded prefix
 * without a full parse. Claude tags every substantive line of a bg transcript with it, starting at the
 * first attachment/turn line, so the first occurrence in the head decides. Returns undefined when the
 * prefix carries none — an interactive session, a bg session with no turns yet, or any read failure (a
 * missing/unreadable file, or a path that turns out to be a directory): discovery treats every such
 * case as interactive, so a single bad transcript never throws out of the per-poll candidate sweep
 * (matching summarize, which degrades the same way on an unreadable transcript).
 *
 * Bounded, unlike firstTranscriptCwd, so it stays O(1) in transcript size in that per-poll loop. It
 * reads up to SESSION_KIND_SCAN_BYTES, draining short reads (a single readSync may return fewer bytes
 * than asked — e.g. on a network filesystem) until the cap or EOF, then decodes the filled prefix once.
 */
export function transcriptSessionKind(path: string): string | undefined {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return undefined; // ENOENT or unreadable — treat as interactive, same as the rest of discovery
  }
  try {
    // allocUnsafe is safe here: we only ever decode the [0, filled) range that readSync actually wrote.
    const buf = Buffer.allocUnsafe(SESSION_KIND_SCAN_BYTES);
    let filled = 0;
    while (filled < buf.length) {
      // Read at the current offset for both buffer and file, so a short read resumes where it left off
      // instead of dropping the bytes in between.
      const bytes = readSync(fd, buf, filled, buf.length - filled, filled);
      if (bytes === 0) break; // EOF
      filled += bytes;
    }
    const head = buf.toString("utf8", 0, filled);
    for (const line of head.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed);
        if (typeof row.sessionKind === "string") return row.sessionKind;
      } catch {
        // A truncated trailing line (the prefix may cut mid-line) or a half-written line won't parse;
        // skip it, same as parseTranscript.
      }
    }
    return undefined;
  } catch {
    // A read failure after a successful open — EISDIR (the path is a directory), EIO on a flaky/network
    // mount, etc. Treat as interactive rather than letting it abort the whole listCandidates sweep.
    return undefined;
  } finally {
    try {
      closeSync(fd);
    } catch {
      // Closing a read-only fd can still fail on a flaky mount; there is nothing to flush, so ignore it
      // rather than let it escape and sink the sweep.
    }
  }
}

/** Claude Code injects '<synthetic>' assistant turns (cancelled or over-limit placeholders) that
 *  carry a zero usage block. They're not a real model and don't represent the session's context. */
const SYNTHETIC_MODEL = "<synthetic>";

// A6 (ccstatusline jsonl-metadata.ts:17-19): the two stdout markers a /effort or /model command
// leaves in the transcript. Forward scan latches the LAST match — same answer as ccs's
// scan-from-the-end, one pass.
const EFFORT_STDOUT_RE =
  /^<local-command-stdout>Set effort level to ([a-zA-Z0-9-]+)\b/i;
const MODEL_STDOUT_EFFORT_RE =
  /^<local-command-stdout>Set model to[\s\S]*? with ([a-zA-Z0-9-]+) effort<\/local-command-stdout>$/i;

/**
 * Reduce a transcript's JSONL into a normalized summary. Parses line by line and
 * skips any unparseable line, so a transcript being appended to right now (a
 * half-written trailing line) is fine.
 */
export function parseTranscript(
  jsonl: string,
  fallbackCwd = "",
): TranscriptSummary {
  let cwd = fallbackCwd;
  let branch: string | undefined;
  let lastModelRaw: string | undefined;
  let lastActivityMs = 0;
  let createdMs = 0; // 0 = no parseable timestamp seen yet
  let effortLevel: string | undefined;
  let customTitle: string | undefined;
  let compactionCount = 0;
  let compactionTokensReclaimed = 0;
  const userPrompts: string[] = [];

  // Token usage summed over every assistant turn (cost is billed per turn), deduped per message id
  // with the LAST row's snapshot winning — Claude Code writes one turn across several JSONL lines,
  // and subagent transcripts stream progressive usage where only the final row is the billed number
  // (see UsageAccumulator).
  const usageAcc = new UsageAccumulator();
  const tail = createTailTracker();

  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let row: any;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (typeof row.cwd === "string") cwd = row.cwd;
    if (typeof row.gitBranch === "string") branch = row.gitBranch;
    // A7: a /rename writes a custom-title row; the newest one is the transcript's own title tier.
    if (row.type === "custom-title" && typeof row.customTitle === "string")
      customTitle = row.customTitle;

    // A9 (ccstatusline compaction.ts:35-70): a compact boundary is a system row; sidechain
    // boundaries are a subagent's own compactions, not this session's.
    if (
      row.type === "system" &&
      row.subtype === "compact_boundary" &&
      !row.isSidechain
    ) {
      compactionCount++;
      const meta = row.compactMetadata;
      if (meta && typeof meta === "object") {
        const pre = (meta as Record<string, unknown>).preTokens;
        const post = (meta as Record<string, unknown>).postTokens;
        if (
          typeof pre === "number" &&
          Number.isFinite(pre) &&
          typeof post === "number" &&
          Number.isFinite(post)
        )
          compactionTokensReclaimed += Math.max(0, pre - post);
      }
    }

    if (typeof row.timestamp === "string") {
      const ms = Date.parse(row.timestamp);
      if (!Number.isNaN(ms)) {
        if (ms > lastActivityMs) lastActivityMs = ms;
        if (createdMs === 0 || ms < createdMs) createdMs = ms;
      }
    }

    if (row.type === "assistant" && typeof row.message?.model === "string") {
      // Skip the '<synthetic>' sentinel: it would otherwise override the real model with the
      // Opus default (normalizeModelId maps every unknown string to Opus).
      if (row.message.model !== SYNTHETIC_MODEL)
        lastModelRaw = row.message.model;
    }

    const content = row.message?.content;
    if (row.type === "assistant") {
      // Sum each turn's usage keyed on message id, last snapshot wins (see UsageAccumulator).
      // contextTokens tracks the latest turn that actually holds context: its full prompt, which is
      // input + both cache parts. A zero-usage turn like a '<synthetic>' placeholder leaves it untouched.
      const usage = row.message?.usage;
      if (usage && typeof usage === "object") {
        const id = typeof row.message?.id === "string" ? row.message.id : null;
        usageAcc.add(id, usage);
      }
      // The waiting signal and current-context split come from the shared tail tracker, one derivation
      // the render parser also drives, so they can't disagree. Feed it only the parent conversation's
      // rows (the render parser skips isSidechain too): a subagent's own pending tool or context split
      // is internal and must not latch the parent's awaitingUser or override its current context. Token
      // counting above stays unconditional — a subagent's usage is still real, billed cost.
      if (!row.isSidechain) {
        const turnId =
          typeof row.message?.id === "string" ? row.message.id : undefined;
        tail.beginAssistantTurn(turnId);
        // An API-error row can carry a partial usage block that is not the turn's real context —
        // never let it become the current-context pick (its tokens still count toward usage totals).
        if (!row.isApiErrorMessage) tail.noteUsage(usage);
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === "tool_use" && typeof block.id === "string") {
              const input = (
                block.input && typeof block.input === "object"
                  ? block.input
                  : {}
              ) as Record<string, unknown>;
              tail.noteToolUse(
                block.id,
                typeof block.name === "string" ? block.name : "",
                input,
              );
            }
          }
        }
      }
    }

    if (row.type === "user") {
      // A tool_result answers a pending tool_use from the current turn (regardless of isMeta). Sidechain
      // results resolve sidechain tools, which the tracker never saw — skip them to stay in lockstep.
      if (!row.isSidechain && Array.isArray(content)) {
        for (const block of content) {
          if (
            block?.type === "tool_result" &&
            typeof block.tool_use_id === "string"
          ) {
            tail.resolveToolResult(block.tool_use_id);
          }
        }
      }
      // A6: the /effort and /model stdout markers land in meta rows, so this scan must run before
      // the non-meta guard below (marker rows ARE meta and would otherwise be skipped entirely).
      const text = userText(content);
      if (text) {
        const m =
          EFFORT_STDOUT_RE.exec(text) ?? MODEL_STDOUT_EFFORT_RE.exec(text);
        if (m?.[1]) effortLevel = m[1].toLowerCase();
      }
      // Only real (non-meta) user turns are prompts that can title the session.
      if (!row.isMeta && text) userPrompts.push(text);
    }
  }

  return {
    title: deriveTitle(userPrompts, cwd, customTitle),
    project: basename(cwd) || "unknown",
    cwd,
    branch,
    model: normalizeModelId(lastModelRaw),
    modelRaw: lastModelRaw,
    lastActivityMs,
    createdMs,
    awaitingUser: tail.awaitingUser,
    usage: usageAcc.totals(),
    contextTokens: tail.context ? contextTotal(tail.context) : 0,
    effortLevel,
    compactionCount,
    compactionTokensReclaimed,
  };
}
