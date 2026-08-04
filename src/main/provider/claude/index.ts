import type { Provider } from "../types";
import type {
  Management,
  PersistedSession,
  SessionCandidate,
} from "@shared/types";
import type { Family } from "@shared/models";
import { resolveClaudeDir } from "../../claude-config";
import { summarize, restate } from "./discover";
import { resolveResumeTarget, resolveSessionCwd } from "./resume-target";
import { createClaudeReader } from "./reader";

export interface ClaudeProviderDeps {
  claudeDir?: string;
  isPidAlive?: (pid: number) => boolean;
  /** Clock for the recency cut; defaults to the wall clock, overridden in tests. */
  now?: () => number;
  /** How recent (ms) an Ended session's transcript must be to surface. The composition root passes the
   *  user's cleanupPeriodDays; the fallback mirrors Claude Code's own 30-day default. */
  recentWindowMs?: number;
  /** The authority for Managed-ness: a discovered session is Managed iff this run spawned its id.
   *  Defaults to "nothing is Managed", so a provider built without it labels everything Observed.
   *  `modelOf` returns the alias we spawned that id on, so summarize can front it before the first
   *  real assistant turn records a model (see `pickedModel`). */
  managed?: {
    has(id: string): boolean;
    modelOf?(id: string): Family | undefined;
  };
  /** Off-thread transcript parse for summarize — the composition root passes the parse-worker
   *  client here, so the sync pass never parses a large transcript on the main thread. A rejection
   *  falls back to the in-process parse (a worker fault may cost one janky pass, never a row).
   *  Absent (tests), summarize parses in-process. */
  parseSession?: (c: SessionCandidate) => Promise<PersistedSession>;
}

const DEFAULT_RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** A pid is alive if signalling it succeeds, or fails only because we lack permission. */
export function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

export function createClaudeProvider(deps: ClaudeProviderDeps = {}): Provider {
  const claudeDir = resolveClaudeDir(deps.claudeDir);
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  const now = deps.now ?? (() => Date.now());
  const recentWindowMs = deps.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS;
  const managed = deps.managed ?? { has: () => false };

  // The whole filesystem-read surface (transcript/metrics/shells/monitors/tasks reads, discovery
  // sweep, per-session path caches) lives in the reader so the same code can be hosted in the
  // parse worker. What stays HERE is main-process-only: managed-ness, model adornment, and the
  // resume/liveness resolution the pty gate depends on.
  const reader = createClaudeReader({ claudeDir, isPidAlive });

  // Managed-ness is recomputed from the registry on every snapshot, not trusted from the stored row:
  // the registry is in-memory, so a Managed row left in the SQLite cache after a restart re-derives as
  // Observed (its pty is gone). This is the one place the discover.ts 'observed' default is overridden.
  const management = (id: string): Management =>
    managed.has(id) ? "managed" : "observed";

  // A Managed session whose transcript hasn't recorded a real model yet — the gap between sending the
  // first prompt (which writes a user turn) and the first assistant turn landing — has no modelRaw, so
  // normalizeModelId(undefined) falls to the Opus fallback. That fallback briefly overrides the alias we
  // actually spawned on, a visible Sonnet → Opus → Sonnet flicker in the Session panel. Front the picked
  // alias from the registry until a real turn lands a modelRaw; once it does, the transcript's true model
  // wins untouched. Observed sessions have no picked alias to vouch for, so they keep the honest fallback.
  const pickedModel = (id: string, s: PersistedSession): Family =>
    s.modelRaw === undefined && managed.has(id)
      ? (managed.modelOf?.(id) ?? s.model)
      : s.model;

  return {
    id: "claude",
    listCandidates: () =>
      reader.listCandidates({ now: now(), recentWindowMs }),
    summarize: async (c) => {
      let s: PersistedSession;
      if (deps.parseSession) {
        try {
          s = await deps.parseSession(c);
        } catch {
          s = summarize(c); // worker fault — parse in-process rather than lose the row
        }
      } else {
        s = summarize(c);
      }
      return {
        ...s,
        management: management(c.id),
        model: pickedModel(c.id, s),
      };
    },
    restate: (c, prev) => ({
      ...restate(c, prev),
      management: management(c.id),
    }),
    resolveResumeTarget: (id) =>
      resolveResumeTarget({ claudeDir, isPidAlive, id }),
    resolveSessionCwd: (id) => resolveSessionCwd({ claudeDir, id }),
    resolveTranscriptPath: (id) => reader.resolveTranscriptPath(id),
    readTranscript: (id, sinceMtimeMs) => reader.readTranscript(id, sinceMtimeMs),
    getToolResult: (id, toolUseId, agentId) =>
      reader.getToolResult(id, toolUseId, agentId),
    readSubagentTranscript: (id, agentId, sinceMtimeMs) =>
      reader.readSubagentTranscript(id, agentId, sinceMtimeMs),
    readTasks: (id, sinceMtimeMs) => reader.readTasks(id, sinceMtimeMs),
    readShells: (id, sinceMtimeMs) => reader.readShells(id, sinceMtimeMs),
    readShellOutput: (id, shellId, sinceMtimeMs) =>
      reader.readShellOutput(id, shellId, sinceMtimeMs),
    readMonitors: (id, sinceMtimeMs) => reader.readMonitors(id, sinceMtimeMs),
    readMonitorOutput: (id, monitorId, sinceMtimeMs) =>
      reader.readMonitorOutput(id, monitorId, sinceMtimeMs),
    readMetrics: (id, sinceMtimeMs) => reader.readMetrics(id, sinceMtimeMs),
  };
}
