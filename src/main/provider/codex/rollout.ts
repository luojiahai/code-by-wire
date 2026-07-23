import { openSync, readSync, closeSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SessionThreadKind } from "@shared/types";

/** One discovered rollout file. `timestampMs` is parsed from the FILENAME (local time) — the
 *  correlation key; fs ctime/birthtime are never used (ctime is inode-change time on POSIX and
 *  birthtime is unreliable on Linux, and CI runs both ubuntu and windows). */
export interface RolloutFile {
  path: string;
  id: string;
  timestampMs: number;
  mtimeMs: number;
}

export const ROLLOUT_HEAD_MAX_LINES = 40;
export const ROLLOUT_HEAD_MAX_BYTES = 65_536;

const FILENAME_RE =
  /^rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-([0-9a-fA-F-]{36})\.jsonl$/;

/** Codex embeds the session's creation time (local) and id in the filename:
 *  `rollout-YYYY-MM-DDThh-mm-ss-<uuid>.jsonl`. Null for anything else. */
export function parseRolloutFilename(
  name: string,
): { id: string; timestampMs: number } | null {
  const m = FILENAME_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, id] = m;
  const t = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  ).getTime();
  return Number.isFinite(t) ? { id, timestampMs: t } : null;
}

/** List an intermediate dir, treating absence/unreadability as empty — one bad day-dir must not
 *  sink the sweep (mirrors the claude discover.ts tolerance for project subdirs). */
function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Every parseable rollout under `<codexDir>/sessions/YYYY/MM/DD/`, one stat each. The walk is
 *  bounded by the date-tree shape; anything non-matching (notes, tmp files, odd dirs) is skipped. */
export function listRollouts(codexDir: string): RolloutFile[] {
  const root = join(codexDir, "sessions");
  const out: RolloutFile[] = [];
  for (const year of safeReaddir(root))
    for (const month of safeReaddir(join(root, year)))
      for (const day of safeReaddir(join(root, year, month)))
        for (const name of safeReaddir(join(root, year, month, day))) {
          const parsed = parseRolloutFilename(name);
          if (!parsed) continue;
          const path = join(root, year, month, day, name);
          try {
            out.push({ path, ...parsed, mtimeMs: statSync(path).mtimeMs });
          } catch {
            // vanished mid-walk — skip
          }
        }
  return out;
}

/** What a bounded head-read of a rollout yields: enough for a sidebar row, nothing more. */
export interface RolloutHead {
  id: string | null;
  cwd: string;
  timestampMs: number | null;
  title: string | null;
  /** Present for Codex agent-thread rollouts, including detached ones whose parent is unavailable. */
  threadKind?: SessionThreadKind;
  parentSessionId?: string;
}

export const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;

function threadRelationship(
  meta: Record<string, unknown>,
): Pick<RolloutHead, "threadKind" | "parentSessionId"> {
  const source = meta.source;
  const sourceRecord = asRecord(source);
  const subagent = sourceRecord ? sourceRecord.subagent : undefined;
  const subagentRecord = asRecord(subagent);
  const spawn = subagentRecord ? asRecord(subagentRecord.thread_spawn) : null;
  const validParent = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() !== "" && value !== meta.id
      ? value
      : undefined;
  // Newer rollouts put the immediate parent directly on session_meta. Older spawned-agent
  // rollouts only carry it inside source.subagent.thread_spawn. Validate the direct value before
  // falling back: a blank or self-referential direct field must not mask a usable legacy parent.
  const parentSessionId =
    validParent(meta.parent_thread_id) ?? validParent(spawn?.parent_thread_id);
  const isSubagent =
    meta.thread_source === "subagent" ||
    source === "subagent" ||
    subagent !== undefined ||
    parentSessionId !== undefined;
  if (!isSubagent) return {};
  let threadKind: SessionThreadKind = "subagent";
  if (subagent === "review") threadKind = "review";
  else if (subagent === "compact") threadKind = "compact";
  else if (subagentRecord?.other === "guardian") threadKind = "guardian";
  return { threadKind, parentSessionId };
}

/** First human user text in a parsed line's payload, if this line is a user message. Codex records
 * environment packets and discovered AGENTS.md instructions as user-role context before the real
 * prompt, so both known machine-context forms must be skipped. */
function userText(payload: Record<string, unknown>): string | null {
  if (payload.type !== "message" || payload.role !== "user") return null;
  const content = Array.isArray(payload.content) ? payload.content : [];
  for (const part of content) {
    const p = asRecord(part);
    const text = p && typeof p.text === "string" ? p.text.trim() : "";
    if (
      text &&
      !text.startsWith("<") &&
      !text.startsWith("# AGENTS.md instructions for ")
    )
      return text.slice(0, 120);
  }
  return null;
}

/**
 * Parse the head of a rollout (pure). Tolerant by design — the exact line shapes vary across
 * codex versions, so this recognizes both the `session_meta` envelope and a bare legacy meta
 * object, skips malformed lines, and never throws. Meta wins first-seen; title is the first
 * human user message text.
 */
export function parseRolloutHead(text: string): RolloutHead {
  const head: RolloutHead = {
    id: null,
    cwd: "",
    timestampMs: null,
    title: null,
  };
  const lines = text.split("\n", ROLLOUT_HEAD_MAX_LINES);
  for (const line of lines) {
    if (head.id !== null && head.title !== null) break;
    let row: Record<string, unknown> | null;
    try {
      row = asRecord(JSON.parse(line));
    } catch {
      continue;
    }
    if (!row) continue;
    const payload = asRecord(row.payload);
    // session_meta envelope, or a bare legacy meta object at top level
    const meta =
      payload &&
      typeof payload.id === "string" &&
      typeof payload.cwd === "string"
        ? payload
        : typeof row.id === "string" && typeof row.cwd === "string"
          ? row
          : null;
    if (head.id === null && meta) {
      head.id = meta.id as string;
      head.cwd = meta.cwd as string;
      Object.assign(head, threadRelationship(meta));
      const ts =
        typeof meta.timestamp === "string" ? Date.parse(meta.timestamp) : NaN;
      head.timestampMs = Number.isFinite(ts) ? ts : null;
      continue;
    }
    if (head.title === null && payload) {
      const t = userText(payload);
      if (t) head.title = t;
    }
  }
  return head;
}

/** Head-read a rollout from disk, bounded to ROLLOUT_HEAD_MAX_BYTES so a huge session file never
 *  gets slurped whole. Null on any fs error (absent, unreadable) — callers degrade per-file. */
export function readRolloutHead(path: string): RolloutHead | null {
  try {
    const fd = openSync(path, "r");
    try {
      const buf = Buffer.alloc(ROLLOUT_HEAD_MAX_BYTES);
      const n = readSync(fd, buf, 0, ROLLOUT_HEAD_MAX_BYTES, 0);
      return parseRolloutHead(buf.toString("utf8", 0, n));
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}
