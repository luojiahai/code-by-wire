import type { Provider } from "../types";
import type { PersistedSession, SessionCandidate, Usage } from "@shared/types";
import { normalizeModelId } from "@shared/models";
import { deriveSessionState } from "../claude/state";
import { projectFromCwd } from "../../project-name";
import { resolveCodexDir } from "./config";
import { listRollouts, readRolloutHead, type RolloutHead } from "./rollout";

/** A rollout touched within this window is "codex is producing output right now". Managed rows
 *  older than it are idle (pty alive, codex at its prompt); observed rows older than it read
 *  ended — an idle observed codex writes nothing and is indistinguishable from an exited one. */
export const CODEX_WORKING_WINDOW_MS = 10_000;

const DEFAULT_RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface CodexProviderDeps {
  codexDir?: string;
  now?: () => number;
  /** Same default as the claude provider; the composition root passes the shared value. */
  recentWindowMs?: number;
  /** The managed registry facade: which rollout ids belong to a live app-spawned pty, and the
   *  spawn cwd fallback for resolveSessionCwd on a pre-claim draft id. */
  managed?: {
    has(id: string): boolean;
    cwdOf?(id: string): string | undefined;
  };
}

const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  cacheCreation5mTokens: 0,
  cacheCreation1hTokens: 0,
};

/**
 * The Codex read-side provider, V1: discovery only. Sidebar rows come from bounded head-reads of
 * `$CODEX_HOME/sessions/**` rollouts; every transcript-shaped reader settles empty (the renderer's
 * capability gates hide those surfaces, and the polls that do run hit these cheap arms). V2+ turns
 * readers on one by one and flips the matching AGENTS capability flags — no renderer wiring.
 */
export function createCodexProvider(deps: CodexProviderDeps = {}): Provider {
  const codexDir = resolveCodexDir(deps.codexDir);
  const now = deps.now ?? (() => Date.now());
  const recentWindowMs = deps.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS;
  const managed = deps.managed ?? { has: () => false };

  // Head-reads are static once the title lands, so cache by path and re-read only while the
  // title is still unknown (the first prompt may land lines after the meta) and the file moved.
  const headCache = new Map<string, { mtimeMs: number; head: RolloutHead }>();
  const headFor = (path: string, mtimeMs: number): RolloutHead | null => {
    const cached = headCache.get(path);
    if (cached && (cached.head.title !== null || cached.mtimeMs === mtimeMs))
      return cached.head;
    const head = readRolloutHead(path);
    if (head) headCache.set(path, { mtimeMs, head });
    return head;
  };

  // Same signal split as claude's registry status: a fresh rollout is "busy"; deriveSessionState
  // maps alive+busy → working, alive → idle, dead → ended.
  const signalsFor = (mtimeMs: number, isManaged: boolean) => {
    const fresh = now() - mtimeMs < CODEX_WORKING_WINDOW_MS;
    return {
      alive: isManaged || fresh,
      status: fresh ? "busy" : undefined,
      awaitingUser: false,
    };
  };

  const candidates = (): SessionCandidate[] => {
    const cutoff = now() - recentWindowMs;
    const out: SessionCandidate[] = [];
    for (const r of listRollouts(codexDir)) {
      // Recent rollouts surface like recent claude transcripts; a stale one still surfaces while
      // a live pty owns it (the claimed row must not vanish mid-session).
      if (r.mtimeMs < cutoff && !managed.has(r.id)) continue;
      const head = headFor(r.path, r.mtimeMs);
      if (!head) continue;
      const sig = signalsFor(r.mtimeMs, managed.has(r.id));
      out.push({
        id: r.id,
        agent: "codex",
        alive: sig.alive,
        status: sig.status,
        cwd: head.cwd,
        transcriptPath: r.path,
        transcriptMtimeMs: r.mtimeMs,
        updatedAt: head.timestampMs ?? r.timestampMs,
      });
    }
    return out;
  };

  const summarizeCandidate = (c: SessionCandidate): PersistedSession => {
    const head = c.transcriptPath
      ? headFor(c.transcriptPath, c.transcriptMtimeMs)
      : null;
    const fallbackName = projectFromCwd(c.cwd);
    return {
      id: c.id,
      agent: "codex",
      title: head?.title ?? fallbackName,
      project: fallbackName,
      cwd: c.cwd,
      branch: undefined,
      state: deriveSessionState(
        signalsFor(c.transcriptMtimeMs, managed.has(c.id)),
      ),
      management: managed.has(c.id) ? "managed" : "observed",
      // Inert placeholder family (spec: model surfaces are unreachable for codex via capability
      // gates); ModelSelection/--model never applies to codex spawns.
      model: normalizeModelId(undefined),
      lastActivityMs: c.transcriptMtimeMs || c.updatedAt || 0,
      createdMs: c.updatedAt || 0,
      awaitingUser: false,
      transcriptMtimeMs: c.transcriptMtimeMs,
      usage: ZERO_USAGE,
      usageByModel: [],
      contextTokens: 0,
    };
  };

  return {
    id: "codex",
    listCandidates: candidates,
    summarize: summarizeCandidate,
    restate: (c, prev) => ({
      ...prev,
      management: managed.has(c.id) ? "managed" : "observed",
      state: deriveSessionState(
        signalsFor(c.transcriptMtimeMs, managed.has(c.id)),
      ),
    }),
    // V1: no transcript-shaped reads. Every arm settles cheaply; renderer polls that still run
    // for a selected codex session cost one of these per tick.
    readTranscript: () => ({ status: "absent" }),
    getToolResult: () => ({ found: false }),
    readSubagentTranscript: () => ({ status: "absent" }),
    readTasks: () => ({ status: "absent" }),
    readShells: () => ({ status: "absent" }),
    readShellOutput: () => ({ status: "absent" }),
    readMonitors: () => ({ status: "absent" }),
    readMonitorOutput: () => ({ status: "absent" }),
    readMetrics: () => ({ status: "absent" }),
    resolveResumeTarget: () => null,
    resolveSessionCwd: (id) => {
      for (const r of listRollouts(codexDir)) {
        if (r.id !== id) continue;
        const head = headFor(r.path, r.mtimeMs);
        if (head?.cwd) return head.cwd;
      }
      return managed.cwdOf?.(id) ?? null;
    },
  };
}
