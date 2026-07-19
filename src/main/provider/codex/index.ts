import type { Provider } from "../types";
import type {
  PersistedSession,
  RateLimitWindows,
  Session,
  SessionCandidate,
  Usage,
} from "@shared/types";
import { normalizeModelId } from "@shared/models";
import { deriveSessionState } from "../claude/state";
import { projectFromCwd } from "../../project-name";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolveCodexDir } from "./config";
import { listRollouts, readRolloutHead, type RolloutHead } from "./rollout";
import { parseRolloutEvents } from "./transcript-events";
import { extractToolResult } from "./tool-result";
import { createScanCache } from "../../util/scan-cache";
import {
  codexContextPct,
  scanRolloutTelemetry,
  speedFromTokenEvents,
  type RolloutTelemetry,
} from "./usage";
import { metricsToken } from "../metrics-token";
import { SPEED_WINDOW_MS } from "../claude/transcript-speed";
import { readGit } from "../../git/read-git";
import { readPr } from "../../git/read-pr";

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
  /** Account-scoped rate limits (limits.ts service). Optional so existing tests build without it. */
  limits?: { read(): RateLimitWindows | null };
}

const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  cacheCreation5mTokens: 0,
  cacheCreation1hTokens: 0,
};

/** The codex provider plus its overview-time session overlay (the codex analog of the claude
 *  statusline overlay — attaches the non-persisted telemetry fields; see overviewNow). */
export interface CodexProvider extends Provider {
  overlaySessions(sessions: Session[]): Session[];
}

/**
 * The Codex read-side provider. V1 shipped discovery (sidebar rows from bounded head-reads of
 * `$CODEX_HOME/sessions/**` rollouts); V2 adds the transcript pane: readTranscript parses the whole
 * rollout into the shared TranscriptDoc, getToolResult backs the drill-in modal. Every other
 * transcript-shaped reader still settles empty (the renderer's capability gates hide those
 * surfaces, and the polls that do run hit these cheap arms). V2+ turns readers on one by one and
 * flips the matching AGENTS capability flags — no renderer wiring.
 */
export function createCodexProvider(
  deps: CodexProviderDeps = {},
): CodexProvider {
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

  // Rollout paths are stable once created (resume appends in place; only fork mints a new file),
  // so cache id → path and re-scan the date tree only on a miss or a vanished file. Claimed
  // managed sessions resolve here too: claiming re-keys the row to codex's real session id, which
  // is the rollout filename's uuid.
  const pathById = new Map<string, string>();
  const rolloutPathFor = (id: string): string | null => {
    const cached = pathById.get(id);
    if (cached && existsSync(cached)) return cached;
    pathById.delete(id);
    for (const r of listRollouts(codexDir)) pathById.set(r.id, r.path);
    const found = pathById.get(id);
    return found && existsSync(found) ? found : null;
  };

  const telemetry = createScanCache<RolloutTelemetry>(scanRolloutTelemetry);
  const telemetryFor = (id: string): RolloutTelemetry | null => {
    const path = rolloutPathFor(id);
    return path ? telemetry.read(path) : null;
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
    const tel = c.transcriptPath ? telemetry.read(c.transcriptPath) : null;
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
      // The raw turn_context model is the honest label (SessionPanel prefers modelRaw); the
      // normalized family stays inert for codex — the context window rides the overlay, not it.
      model: normalizeModelId(tel?.modelRaw ?? undefined),
      modelRaw: tel?.modelRaw ?? undefined,
      lastActivityMs: c.transcriptMtimeMs || c.updatedAt || 0,
      createdMs: c.updatedAt || 0,
      awaitingUser: false,
      transcriptMtimeMs: c.transcriptMtimeMs,
      usage: tel?.usage ?? ZERO_USAGE,
      usageByModel: tel?.usageByModel ?? [],
      contextTokens: tel?.contextTokens ?? 0,
      effortLevel: tel?.effortLevel ?? undefined,
      compactionCount: tel?.compactionCount || undefined,
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
    readTranscript: (id, sinceMtimeMs) => {
      const path = rolloutPathFor(id);
      if (!path) return { status: "absent" };
      let mtimeMs: number;
      try {
        mtimeMs = statSync(path).mtimeMs;
      } catch {
        return { status: "absent" }; // vanished between resolve and stat
      }
      if (sinceMtimeMs !== undefined && mtimeMs === sinceMtimeMs)
        return { status: "unchanged", mtimeMs };
      let text: string;
      try {
        text = readFileSync(path, "utf8");
      } catch {
        return { status: "error" }; // transient read failure on an existing file
      }
      return {
        status: "changed",
        mtimeMs,
        doc: { ...parseRolloutEvents(text), subagents: [] },
      };
    },
    getToolResult: (id, toolUseId) => {
      const path = rolloutPathFor(id);
      if (!path) return { found: false };
      try {
        return extractToolResult(readFileSync(path, "utf8"), toolUseId);
      } catch {
        return { found: false };
      }
    },
    // Still stubbed (capabilities off): subagents, tasks, shells, monitors, metrics. Each arm
    // settles cheaply if a poll slips through.
    readSubagentTranscript: () => ({ status: "absent" }),
    readTasks: () => ({ status: "absent" }),
    readShells: () => ({ status: "absent" }),
    readShellOutput: () => ({ status: "absent" }),
    readMonitors: () => ({ status: "absent" }),
    readMonitorOutput: () => ({ status: "absent" }),
    readMetrics: (id, sinceMtimeMs) => {
      try {
        const path = rolloutPathFor(id);
        if (!path) return { status: "absent" };
        let mtimeMs: number;
        try {
          mtimeMs = statSync(path).mtimeMs;
        } catch {
          return { status: "absent" };
        }
        const cwd = headFor(path, mtimeMs)?.cwd ?? "";
        const git = cwd ? readGit(cwd) : null;
        // Same skip rule as claude's readSources: no browsable remote → no gh spawn.
        const pr = cwd && git && git.remoteUrl ? readPr(cwd, git.branch) : null;
        const sources = { git, pr, voice: null, remote: null };
        const token = metricsToken(mtimeMs, sources);
        if (token === sinceMtimeMs)
          return { status: "unchanged", mtimeMs: token };
        const tel = telemetry.read(path);
        return {
          status: "changed",
          mtimeMs: token,
          metrics: {
            tokenSpeed: tel
              ? speedFromTokenEvents(tel.tokenEvents, SPEED_WINDOW_MS)
              : null,
            git,
            pr,
            voiceEnabled: null,
            remoteControl: null,
          },
        };
      } catch {
        return { status: "error" };
      }
    },
    resolveResumeTarget: (id) => {
      const path = rolloutPathFor(id);
      if (!path) return null;
      let mtimeMs: number;
      try {
        mtimeMs = statSync(path).mtimeMs;
      } catch {
        return null; // vanished between resolve and stat
      }
      const cwd = headFor(path, mtimeMs)?.cwd;
      if (!cwd) return null;
      // Alive = a live app-owned pty already writes this rollout, OR the file is mtime-fresh — the
      // same freshness signal signalsFor paints the row "working" with, so the refusal gate and the
      // displayed state agree (claude's registry-pid analog). A live-but-IDLE external codex writes
      // nothing and is indistinguishable from an exited one (no pid registry to probe); that
      // residual two-writer risk is accepted and documented in the spec.
      const fresh = now() - mtimeMs < CODEX_WORKING_WINDOW_MS;
      return { alive: managed.has(id) || fresh, cwd, rolloutPath: path };
    },
    resolveSessionCwd: (id) => {
      for (const r of listRollouts(codexDir)) {
        if (r.id !== id) continue;
        const head = headFor(r.path, r.mtimeMs);
        if (head?.cwd) return head.cwd;
      }
      return managed.cwdOf?.(id) ?? null;
    },
    // The codex analog of the claude statusline overlay: attach the non-persisted telemetry fields
    // (liveContext, real window, TUI-formula contextPct, account rate limits) at overview time.
    // liveContext is load-bearing — the renderer's contextView only honors a provided pct when a
    // live breakdown is present. Non-codex rows pass through untouched.
    overlaySessions: (sessions: Session[]): Session[] =>
      sessions.map((s) => {
        if (s.agent !== "codex") return s;
        const tel = telemetryFor(s.id);
        const limits = deps.limits?.read() ?? null;
        if (!tel && !limits) return s;
        const window = tel?.modelContextWindow ?? s.contextWindow;
        return {
          ...s,
          contextWindow: window,
          contextPct:
            tel && tel.contextTokens > 0
              ? codexContextPct(tel.contextTokens, window)
              : s.contextPct,
          liveContext: tel?.liveContext ?? undefined,
          rateLimits: limits ?? undefined,
        };
      }),
  };
}
