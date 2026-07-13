import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Provider } from "../types";
import type { PersistedSession, SessionState } from "@shared/types";
import type { TranscriptRead } from "@shared/transcript";
import { normalizeModelId } from "@shared/models";
import { CODEX_PROVIDER_ID, PROVIDER_CAPABILITIES } from "@shared/providers";
import {
  DEFAULT_LIVE_WINDOW_MS,
  DEFAULT_RECENT_WINDOW_MS,
  indexRollouts,
  listCodexCandidates,
  readIndexTitles,
} from "./discover";
import { parseRolloutRows } from "./rollout";
import { extractRolloutToolResult, parseRolloutEvents } from "./events";
import { firstRolloutCwd, parseRolloutSummary } from "./summary";

export interface CodexProviderDeps {
  /** The Codex home (default ~/.codex). When it doesn't exist, the provider contributes zero
   *  sessions and zero errors. */
  codexDir?: string;
  /** Clock for the recency cut and the liveness window; overridden in tests. */
  now?: () => number;
  /** How recent (ms) a rollout must be to surface — mirrors the Claude provider's window. */
  recentWindowMs?: number;
  /** How fresh (ms) a rollout's mtime must be to read as live (see discover.isRolloutLive). */
  liveWindowMs?: number;
}

/** File text or null on any read failure — the same degrade-to-absent posture as the Claude reads. */
function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Observe-only state: with no pid registry and no status field, a fresh-appending rollout is the
 *  only "something is happening" signal — call it working — and a quiet one is ended. waiting/idle
 *  would require signals the rollout doesn't carry (see isRolloutLive's rationale). */
function stateOf(alive: boolean): SessionState {
  return alive ? "working" : "ended";
}

/**
 * The read-only Codex CLI provider (observe-only v1): discovers rollouts under
 * `~/.codex/sessions/YYYY/MM/DD/`, summarizes them into the same PersistedSession the index already
 * stores, and serves the render-ready transcript behind the Observed workspace view. No pty
 * spawning, no adopt/fork, no statusline — the capability flags say so, and the UI degrades off
 * them. Sub-surfaces Claude owns (subagents, tasks, shells, monitors, metrics) answer `absent`,
 * which every consumer already treats as "this session has none".
 */
export function createCodexProvider(deps: CodexProviderDeps = {}): Provider {
  const codexDir = deps.codexDir ?? join(homedir(), ".codex");
  const now = deps.now ?? (() => Date.now());
  const recentWindowMs = deps.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS;
  const liveWindowMs = deps.liveWindowMs ?? DEFAULT_LIVE_WINDOW_MS;

  // Last-resolved rollout path per session id, so a steady Observed-view poll stats ONE file
  // instead of re-walking the dated tree each tick — the same cache discipline as the Claude
  // provider's pathById. The full (bounded) sweep runs only on a cold miss or a vanished file.
  const pathById = new Map<string, string>();
  const resolveRollout = (
    id: string,
  ): { path: string; mtimeMs: number } | null => {
    const cached = pathById.get(id);
    if (cached !== undefined) {
      try {
        return { path: cached, mtimeMs: statSync(cached).mtimeMs };
      } catch {
        pathById.delete(id); // moved/deleted — fall through to a fresh sweep
      }
    }
    const hit = indexRollouts(codexDir, now(), recentWindowMs).get(id);
    if (!hit) return null;
    pathById.set(id, hit.path);
    return hit;
  };

  // Thread names from session_index.jsonl, refreshed once per discovery pass (listCandidates) so a
  // sync that summarizes N sessions tail-reads the index once, not N times. Lazily seeded for a
  // summarize that runs before any pass (tests, cold restores).
  let titles: Map<string, string> | null = null;
  const titleOf = (id: string): string | undefined =>
    (titles ??= readIndexTitles(codexDir)).get(id);

  const summarize = (
    c: Parameters<Provider["summarize"]>[0],
  ): PersistedSession => {
    const jsonl = c.transcriptPath ? readTextOrNull(c.transcriptPath) : null;
    // An unreadable rollout degrades to a skeleton (mirrors the Claude summarize): the row still
    // surfaces, and the next sync retries because the stored mtime stays behind the file's.
    const s = jsonl !== null ? parseRolloutSummary(jsonl) : null;
    const project = s?.cwd ? basename(s.cwd) : "codex";
    return {
      id: c.id,
      title: titleOf(c.id) ?? s?.firstPrompt ?? project,
      project,
      cwd: s?.cwd ?? "",
      branch: s?.branch,
      state: stateOf(c.alive),
      management: "observed", // v1 is observe-only by definition; nothing Codex is ever Managed
      model: normalizeModelId(s?.modelRaw),
      modelRaw: s?.modelRaw,
      lastActivityMs: s?.lastActivityMs || c.updatedAt || 0,
      createdMs: s?.createdMs || c.updatedAt || 0,
      awaitingUser: false, // no honest blocked-on-user signal in a rollout (see parseRolloutEvents)
      transcriptMtimeMs: c.transcriptMtimeMs,
      usage: s?.usage ?? {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        cacheCreation5mTokens: 0,
        cacheCreation1hTokens: 0,
      },
      // Single-entry breakdown: a rollout reports one cumulative counter, not per-model splits.
      usageByModel: s?.modelRaw
        ? [{ modelRaw: s.modelRaw, usage: s.usage }]
        : [],
      contextTokens: s?.contextTokens ?? 0,
      contextWindow: s?.contextWindow,
      effortLevel: s?.effortLevel,
      compactionCount: s?.compactionCount ?? 0,
      compactionTokensReclaimed: 0, // compacted rows don't record pre/post token counts
    };
  };

  return {
    id: CODEX_PROVIDER_ID,
    capabilities: PROVIDER_CAPABILITIES[CODEX_PROVIDER_ID],
    listCandidates: () => {
      titles = readIndexTitles(codexDir);
      return listCodexCandidates({
        codexDir,
        now: now(),
        recentWindowMs,
        liveWindowMs,
      });
    },
    summarize,
    restate: (c, prev) => ({ ...prev, state: stateOf(c.alive) }),
    readTranscript: (id, sinceMtimeMs): TranscriptRead => {
      try {
        const resolved = resolveRollout(id);
        if (!resolved) return { status: "absent" };
        const { path, mtimeMs } = resolved;
        if (mtimeMs === sinceMtimeMs) return { status: "unchanged", mtimeMs };
        const jsonl = readTextOrNull(path);
        if (jsonl === null) {
          pathById.delete(id);
          return { status: "absent" }; // gone between stat and read
        }
        return {
          status: "changed",
          mtimeMs,
          doc: {
            ...parseRolloutEvents(parseRolloutRows(jsonl)),
            subagents: [],
          },
        };
      } catch {
        // Transient (EACCES, EIO): report an error so the view keeps its last doc — the shared
        // ReadSettled contract, same as the Claude provider.
        return { status: "error" };
      }
    },
    getToolResult: (id, toolUseId) => {
      try {
        const path = pathById.get(id) ?? resolveRollout(id)?.path;
        if (path === undefined) return { found: false };
        const jsonl = readTextOrNull(path);
        if (jsonl === null) return { found: false };
        return extractRolloutToolResult(parseRolloutRows(jsonl), toolUseId);
      } catch {
        return { found: false };
      }
    },
    // Codex rollouts have no sidechain files, task stores, background shells, or monitors; `absent`
    // is the contract's honest "this session has none", which the renderer already renders empty.
    readSubagentTranscript: () => ({ status: "absent" }),
    readTasks: () => ({ status: "absent" }),
    readShells: () => ({ status: "absent" }),
    readShellOutput: () => ({ status: "absent" }),
    readMonitors: () => ({ status: "absent" }),
    readMonitorOutput: () => ({ status: "absent" }),
    // Metrics (token speed, git glance, voice, remote) are Claude-session instruments; the panels
    // show their no-data states off an absent read.
    readMetrics: () => ({ status: "absent" }),
    // Nothing Codex can be adopted — canControl is false and the UI never offers it; null keeps the
    // main-process gate honest if anything ever asks.
    resolveAdoptTarget: () => null,
    resolveSessionCwd: (id) => {
      try {
        const path = pathById.get(id) ?? resolveRollout(id)?.path;
        if (path === undefined) return null;
        const jsonl = readTextOrNull(path);
        if (jsonl === null) return null;
        return firstRolloutCwd(jsonl) || null;
      } catch {
        return null;
      }
    },
  };
}
