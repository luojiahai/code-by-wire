import type { Family, ModelSelection } from "./models";
import type { ContextBreakdown } from "./transcript";

export type { Family, ModelSelection };

export type SessionState = "working" | "waiting" | "idle" | "ended";
export type Management = "managed" | "observed";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Authoritative cache-creation total (= 5m + 1h), from cache_creation_input_tokens. */
  cacheCreationTokens: number;
  /** Tokens written into the 5-minute ephemeral cache. */
  cacheCreation5mTokens: number;
  /** Tokens written into the 1-hour ephemeral cache. */
  cacheCreation1hTokens: number;
}

/** One model's token usage within a session — the (session × model) shape the analytics store records,
 *  carried per-session so the Tokens panel can show per-model token attribution (main thread and subagents).
 *  `modelRaw` is the transcript's raw id (e.g. "claude-opus-4-8"), or null for a turn that recorded
 *  no model; an id matching no known family still counts its tokens. */
export interface ModelUsage {
  modelRaw: string | null;
  usage: Usage;
}

export interface Task {
  id: string;
  subject: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  blockedBy?: string[];
}

/** One background bash shell a session spawned (run_in_background, Ctrl+B, or assistant auto-background).
 *  Reconstructed from the main transcript; the renderer-facing shape carries no filesystem path (the
 *  `.output` path stays server-side and is read via readShellOutput). */
export interface BackgroundShell {
  /** The Claude `backgroundTaskId` (e.g. "bgp2dvqo4"); stable id for the shell. */
  id: string;
  /** The Bash command line that was backgrounded. */
  command: string;
  /** The Bash tool's `description` arg, when one was given. */
  description?: string;
  /** running until a completion notification lands (completed) or a kill is seen (killed). */
  status: "running" | "completed" | "killed";
  /** Exit code parsed from the completion summary; present once completed. Non-zero ⇒ the row reads failed. */
  exitCode?: number;
  /** Start wall-clock (epoch ms): the background-start tool_result's timestamp. */
  startMs?: number;
  /** end − start once finished; absent while running. */
  durationMs?: number;
  /** How it was backgrounded: explicit run_in_background, assistant auto-background, or Ctrl+B. */
  trigger: "explicit" | "auto" | "user";
}

/** The drilled-in view of one shell's output: the (byte-bounded) log text, where it came from, and how
 *  many leading bytes were dropped (0 when whole). */
export interface ShellOutput {
  text: string;
  source: "live" | "snapshot";
  truncatedBytes: number;
}

export interface Subagent {
  id: string;
  type: string;
  status: "working" | "done" | "failed";
  /** Absent until an assistant turn reports a model (a just-spawned agent has none yet). */
  model?: Family;
  /** Wall-clock start (epoch ms): the agent's first parseable transcript timestamp. Absent when no row
   *  carried a timestamp, so the lane can't be positioned and falls back to the timeline's left edge. */
  startMs?: number;
  tokens: number;
  durationMs: number;
  /** The agent's own tool calls: the count of tool_use ids it dispatched. A nested Task/Agent
   *  dispatch counts too, since dispatching a subagent is itself a tool call. */
  toolCount: number;
  /** The task label from the dispatch meta (the Agent/Task tool's `description`). Absent when the
   *  meta carries none. */
  description?: string;
  /** The dispatching assistant message id. Agents sharing it were fired in one assistant turn
   *  (one fan-out batch); the Subagents gantt groups lanes by it. Absent when the dispatch
   *  could not be located (empty/unknown toolUseId, or a dispatch row with no message id). */
  batchId?: string;
  /** The id of the Task/Agent tool_use that spawned this agent (its parent's dispatch). Equals the
   *  inline transcript event's toolUseId; resolves an inline-dispatch drill to this node. Absent only
   *  when the meta carried no toolUseId. */
  dispatchId?: string;
  children?: Subagent[];
}

/** A cwd's linked-worktree identity: the main checkout it belongs to and the worktree's own name.
 *  Attached to Session when the cwd is inside a linked git worktree (live-detected, or recalled from
 *  the durable map after the worktree directory is gone), so the sidebar merges the session into the
 *  main repo's folder and tags the row. */
export interface SessionWorktree {
  /** The main checkout's root — the merged sidebar group's key and its quick-add cwd. */
  repoRoot: string;
  /** basename(repoRoot), the merged group's folder label. */
  repoLabel: string;
  /** The worktree directory's basename — the session row's dimmed hint. */
  name: string;
}

export interface Session {
  id: string;
  title: string;
  project: string;
  branch?: string;
  state: SessionState;
  management: Management;
  /** Whether this session can be resumed — Adopt (`claude --resume`) and Fork (`--fork-session`) both
   *  read its transcript. An optimistic draft (a just-spawned or just-forked session, before its first
   *  turn) has none yet, so those actions are offered only when this is true — else the CLI dies on
   *  "No conversation found with session id". Derived in `hydrate` from the persisted transcript mtime. */
  resumable: boolean;
  model: Family;
  contextPct: number;
  contextWindow: number;
  /** The live context split from the statusLine capture (current_usage), or null/undefined when no
   *  capture reported it. Preferred over the transcript-derived split in the Context panel. */
  liveContext?: ContextBreakdown | null;
  /** The capture's raw model id and Claude's own label, used only for the honest model label (the
   *  context window still rides the normalized `model`). Absent when there's no capture. */
  modelId?: string;
  modelDisplayName?: string;
  /** The exact resolved model id from the transcript (`message.model`), persisted across syncs. The
   *  honest label prefers the live statusLine `modelId` when present, else this. Absent for a session
   *  whose transcript reported no model yet. */
  modelRaw?: string;
  usage: Usage;
  /** Per-model token breakdown — main thread and subagents both — that the Tokens panel reads for
   *  everything (combined rows, attribution, popovers). Always set by hydrate (≥1 entry, the
   *  single-entry fallback for a session with no subagents). `usage` above stays main-thread only and
   *  unchanged, so no other consumer is surprised. */
  usageByModel?: ModelUsage[];
  /** Lines added/removed this session, from the statusLine `cost` block. Absent ⇒ no sample. */
  linesAdded?: number;
  linesRemoved?: number;
  /** Thinking effort level from the live capture (effort.level). Absent ⇒ no sample / not reported. */
  effortLevel?: string;
  /** Elapsed session wall-clock in ms (cost.total_duration_ms). Absent ⇒ no sample. */
  sessionClockMs?: number;
  /** Best-known working directory: the live statusLine capture when present, else the transcript's
   *  persisted cwd. Keys the sidebar's project groups. Absent when neither source knows. */
  cwd?: string;
  /** Present when `cwd` is inside a linked git worktree; the sidebar merges this session into the
   *  main repo's folder (see SessionWorktree). */
  worktree?: SessionWorktree;
  /** Claude Code's own session cost (statusLine cost.total_cost_usd) — the Spend panel's small $
   *  readout. Display-only, never derived from a pricing table. Absent ⇒ no sample. */
  costUsd?: number;
  /** Cumulative API-in-flight time (cost.total_api_duration_ms), the Duty panel's numerator over
   *  sessionClockMs. Absent ⇒ no sample. */
  apiDurationMs?: number;
  /** The capture's pr block. Preferred over the gh-polled PrInfo (fresher, carries review state);
   *  gh remains the fallback when there is no capture. Absent ⇒ no sample or no PR. */
  pr?: SessionPr;
  lastActivityMs: number;
  /** Session creation time (epoch ms); see PersistedSession.createdMs. The rail orders Active
   *  sessions by this, newest first. */
  createdMs: number;
  currentTask?: string;
  waitingReason?: string;
}

/**
 * The narrow per-session snapshot the index actually persists. Everything a SQLite row holds.
 * Derived display values (contextPct) are NOT stored — `hydrate` computes them
 * from these fields when a row is read back, so the formula lives in exactly one place.
 */
export interface PersistedSession {
  id: string;
  title: string;
  project: string;
  /** The session's working directory: the transcript's recorded cwd, else the registry
   *  candidate's. '' when neither source knows. Keys the sidebar's path-keyed project groups. */
  cwd: string;
  branch?: string;
  state: SessionState;
  management: Management;
  model: Family;
  /** The raw transcript model string for this session (see Session.modelRaw). */
  modelRaw?: string;
  lastActivityMs: number;
  /** Session creation time (epoch ms): the earliest parseable transcript timestamp, frozen as the
   *  monotonic minimum across reparses (see store.ts UPSERT). Falls back to the registry updatedAt,
   *  else 0. The rail's Active list sorts on this so a row doesn't move as the session works. */
  createdMs: number;
  /** Last parsed transcript tail left a prompt unanswered. Stored so state can be recomputed on a
   *  sync that skips the (unchanged) transcript, without reparsing it. */
  awaitingUser: boolean;
  /** mtime (ms) of the transcript when it was last parsed — the incremental high-water mark. A sync
   *  reparses only when the file's current mtime exceeds this. 0 means the session has no transcript. */
  transcriptMtimeMs: number;
  /** Token usage summed across the transcript's assistant turns. */
  usage: Usage;
  /** The per-session, per-model usage breakdown (main `<session>.jsonl` plus each `subagents/agent-*.jsonl`),
   *  folded by raw model id. Empty for a transcript with no assistant turns; hydrate synthesizes a
   *  single-entry main-thread fallback so the panel still renders. */
  usageByModel?: ModelUsage[];
  /** Latest turn's full prompt (input + cache-read + cache-creation): the current context size, for context %. */
  contextTokens: number;
}

/**
 * A session the index might track this pass, before the expensive transcript parse. Cheap to build
 * (a directory listing plus a stat), it carries just enough for the sync to decide whether to
 * reparse (`transcriptMtimeMs`) and how to derive state (`alive`, `status`).
 */
export interface SessionCandidate {
  id: string;
  /** Is the owning process still alive? False for a transcript with no live registry entry — an Ended session. */
  alive: boolean;
  /** The provider's raw status hint (Claude: 'busy' | 'waiting' | …), if the session has a live registry entry. */
  status?: string;
  /** Working directory from the registry, if any. The transcript itself is the richer source once parsed. */
  cwd: string;
  /** Absolute path to the transcript file, if one exists. */
  transcriptPath?: string;
  /** Current transcript mtime (ms); 0 when there is no transcript. */
  transcriptMtimeMs: number;
  /** Registry-reported last touch (ms), a fallback for last activity when there is no transcript. */
  updatedAt?: number;
}

export interface RateLimit {
  /** Percent of the window consumed, 0–100 (the statusLine's used_percentage). */
  usedPct: number;
  /** When the window resets, epoch ms. The statusLine reports epoch seconds; the reader normalizes to ms. */
  resetsAt: number;
}

/** The session's pull request as the statusLine capture reports it (`pr` block). `reviewState` is
 *  the raw review_state string ("pending" / "approved" / "changes_requested" / anything newer), or
 *  null when the capture omitted it. Fresher than the gh-polled PrInfo and carries state. */
export interface SessionPr {
  number: number;
  url: string;
  reviewState: string | null;
}

/** The app-wide account, derived from the freshest statusLine captures. Billing mode is decided in
 *  deriveAccount: a capture carrying rate_limits is a subscription (even when all windows are expired —
 *  the rate_limits history is proof); otherwise api. */
export interface Account {
  billingMode: "subscription" | "api";
  /** Present only for a subscription; otherwise no account rate limits. */
  fiveHour?: RateLimit;
  sevenDay?: RateLimit;
  /** Weekly per-model sub-buckets, present only when the capture's rate_limits carried them. */
  sevenDaySonnet?: RateLimit;
  sevenDayOpus?: RateLimit;
  /** Claude Code CLI version from the freshest live capture. Absent when no capture reported it. */
  version?: string;
  /** Logged-in account email, read from ~/.claude.json by the ipc layer (not derived from samples). */
  email?: string;
}

/** What a Provider can do. Drives graceful degradation in the UI. */
export interface ProviderCapabilities {
  canControl: boolean;
  hasRateLimits: boolean;
  hasSubagents: boolean;
}
