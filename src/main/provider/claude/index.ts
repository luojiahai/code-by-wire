import type { Provider } from "../types";
import type {
  Management,
  PersistedSession,
  SessionCandidate,
} from "@shared/types";
import type { Family } from "@shared/models";
import type {
  ToolResultDetail,
  TranscriptReadWire,
} from "@shared/transcript";
import { toTranscriptWire } from "@shared/transcript";
import type { MetricsRead } from "@shared/metrics";
import type {
  MonitorOutputRead,
  MonitorsRead,
  ShellOutputRead,
  ShellsRead,
  TaskRead,
} from "@shared/ipc";
import { resolveClaudeDir } from "../../claude-config";
import { summarize, restate } from "./discover";
import { resolveResumeTarget, resolveSessionCwd } from "./resume-target";
import { createClaudeReader } from "./reader";

/**
 * The worker-backed twin of the reader's read surface (plus summarize), one method per parse-worker
 * op. The composition root builds it over the parse-worker client; tests stub single methods. Every
 * method may reject — the provider answers a rejection with the same read in-process, so a worker
 * fault costs one janky pass, never a lost result.
 */
export interface RemoteClaudeReads {
  summarize(c: SessionCandidate): Promise<PersistedSession>;
  listCandidates(
    now: number,
    recentWindowMs: number,
  ): Promise<SessionCandidate[]>;
  readTranscript(id: string, since?: number): Promise<TranscriptReadWire>;
  readSubagentTranscript(
    id: string,
    agentId: string,
    since?: number,
  ): Promise<TranscriptReadWire>;
  getToolResult(
    id: string,
    toolUseId: string,
    agentId?: string,
  ): Promise<ToolResultDetail>;
  readTasks(id: string, since?: number): Promise<TaskRead>;
  readShells(id: string, since?: number): Promise<ShellsRead>;
  readShellOutput(
    id: string,
    shellId: string,
    since?: number,
  ): Promise<ShellOutputRead>;
  readMonitors(id: string, since?: number): Promise<MonitorsRead>;
  readMonitorOutput(
    id: string,
    monitorId: string,
    since?: number,
  ): Promise<MonitorOutputRead>;
  readMetrics(id: string, since?: number): Promise<MetricsRead>;
}

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
  /** Off-thread reads — the composition root passes the parse-worker-backed RemoteClaudeReads here,
   *  so neither the sync pass nor a poll-driven view read touches a transcript on the main thread.
   *  Partial so tests stub one method; any absent method (and any rejection) runs the same read
   *  in-process via the local reader. */
  remote?: Partial<RemoteClaudeReads>;
}

const DEFAULT_RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** A pid is alive if signalling it succeeds, or fails only because we lack permission. Exported for
 *  the parse worker, whose reader probes liveness with the same rule main does. */
export function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

/** Prefer the worker's answer; on any fault (or no worker wired) run the read in-process. */
async function orLocal<T>(
  viaWorker: Promise<T> | undefined,
  local: () => T,
): Promise<T> {
  if (viaWorker) {
    try {
      return await viaWorker;
    } catch {
      // worker fault — fall through to the in-process read rather than lose the result
    }
  }
  return local();
}

export function createClaudeProvider(deps: ClaudeProviderDeps = {}): Provider {
  const claudeDir = resolveClaudeDir(deps.claudeDir);
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  const now = deps.now ?? (() => Date.now());
  const recentWindowMs = deps.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS;
  const managed = deps.managed ?? { has: () => false };
  const remote = deps.remote ?? {};

  // The whole filesystem-read surface (transcript/metrics/shells/monitors/tasks reads, discovery
  // sweep, per-session path caches) lives in the reader; in the steady state the WORKER's twin
  // instance serves it and this one only answers faults. What stays main-only in this file:
  // managed-ness, model adornment, and the resume/liveness resolution the pty gate depends on.
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
    listCandidates: () => {
      const t = now();
      return orLocal(remote.listCandidates?.(t, recentWindowMs), () =>
        reader.listCandidates({ now: t, recentWindowMs }),
      );
    },
    summarize: async (c) => {
      const s = await orLocal(remote.summarize?.(c), () => summarize(c));
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
    // The local fallback stringifies on main (toTranscriptWire) — the one case the O(doc) cost is
    // paid on the main thread, bounded to worker-fault passes.
    readTranscript: (id, since) =>
      orLocal(remote.readTranscript?.(id, since), () =>
        toTranscriptWire(reader.readTranscript(id, since)),
      ),
    getToolResult: (id, toolUseId, agentId) =>
      orLocal(remote.getToolResult?.(id, toolUseId, agentId), () =>
        reader.getToolResult(id, toolUseId, agentId),
      ),
    readSubagentTranscript: (id, agentId, since) =>
      orLocal(remote.readSubagentTranscript?.(id, agentId, since), () =>
        toTranscriptWire(reader.readSubagentTranscript(id, agentId, since)),
      ),
    readTasks: (id, since) =>
      orLocal(remote.readTasks?.(id, since), () => reader.readTasks(id, since)),
    readShells: (id, since) =>
      orLocal(remote.readShells?.(id, since), () =>
        reader.readShells(id, since),
      ),
    readShellOutput: (id, shellId, since) =>
      orLocal(remote.readShellOutput?.(id, shellId, since), () =>
        reader.readShellOutput(id, shellId, since),
      ),
    readMonitors: (id, since) =>
      orLocal(remote.readMonitors?.(id, since), () =>
        reader.readMonitors(id, since),
      ),
    readMonitorOutput: (id, monitorId, since) =>
      orLocal(remote.readMonitorOutput?.(id, monitorId, since), () =>
        reader.readMonitorOutput(id, monitorId, since),
      ),
    readMetrics: (id, since) =>
      orLocal(remote.readMetrics?.(id, since), () =>
        reader.readMetrics(id, since),
      ),
  };
}
