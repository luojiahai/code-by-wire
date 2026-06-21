import { statSync } from "node:fs";
import type { Provider } from "../types";
import type { Management, PersistedSession } from "@shared/types";
import type { Family } from "@shared/models";
import { readTextOrNull, resolveClaudeDir } from "../../claude-config";
import {
  indexTranscripts,
  listCandidates,
  summarize,
  restate,
} from "./discover";
import { parseTranscriptEventsFromRows } from "./transcript-events";
import { parseJsonlRows } from "./transcript-row";
import {
  buildSubagentForest,
  readSubagentSources,
  subagentFileFor,
  subagentsDirFor,
  subagentsNewestMtime,
} from "./subagents";
import { readTasksForSession, tasksNewestMtime } from "./tasks";
import {
  reconstructShells,
  tailOutput,
  stitchSnapshots,
  toBackgroundShell,
} from "./shells";
import { resolveAdoptTarget } from "./adopt-target";
import { computeTokenSpeed, SPEED_WINDOW_MS } from "./transcript-speed";
import { firstTranscriptCwd } from "./transcript";
import { readGit } from "../../git/read-git";
import { readPr } from "../../git/read-pr";
import { readVoiceEnabled } from "../../settings/voice";
import { readRemoteControl } from "../../settings/remote-control";
import type {
  GitInfo,
  MetricsRead,
  PrInfo,
  SessionMetrics,
  TokenSpeed,
} from "@shared/metrics";
import type { ShellsRead, ShellOutputRead } from "@shared/ipc";

export interface ClaudeProviderDeps {
  claudeDir?: string;
  isPidAlive?: (pid: number) => boolean;
  /** Clock for the recency cut; defaults to the wall clock, overridden in tests. */
  now?: () => number;
  /** How recent (ms) an Ended session's transcript must be to surface; defaults to 7 days. */
  recentWindowMs?: number;
  /** The authority for Managed-ness: a discovered session is Managed iff this run spawned its id.
   *  Defaults to "nothing is Managed", so a provider built without it labels everything Observed.
   *  `modelOf` returns the alias we spawned that id on, so summarize can front it before the first
   *  real assistant turn records a model (see `pickedModel`). */
  managed?: {
    has(id: string): boolean;
    modelOf?(id: string): Family | undefined;
  };
}

const DEFAULT_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A stable 32-bit hash of the composite metrics token (transcript mtime + git/voice/remote state), so the
 *  renderer's numeric `since` dedupe works even though those changes aren't mtimes. */
function hashToken(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The git portion of the metrics change token: a compact string of the state that should re-trigger a
 *  recompute, or 'nogit' when the cwd isn't a repo. */
function gitTokenStr(git: GitInfo | null): string {
  return git
    ? `${git.sha}:${git.insertions}:${git.deletions}:${git.dirty}:${git.ahead}:${git.behind}`
    : "nogit";
}

/** The PR portion of the metrics change token: the PR number, or 'nopr'. Folded into metricsToken so the
 *  Git cell re-renders the poll after a background `gh` fetch resolves. */
function prTokenStr(pr: PrInfo | null): string {
  return pr ? `pr:${pr.number}` : "nopr";
}

/** The lazy metric sources read before the change token: the git glance, voice flag, and remote-control
 *  flag. git/voice are null off a repo-less cwd. */
interface MetricsSources {
  git: GitInfo | null;
  pr: PrInfo | null;
  voice: boolean | null;
  remote: boolean | null;
}

/** Read git, voice, and remote for a session. Folded into the change token (metricsToken) so the header's
 *  Voice/Remote stats and the Git panel can't go stale on a settings/manifest change that never touched the
 *  transcript. (These run every poll; mtime-gating their reads the way readGit does is the perf follow-up.) */
function readSources(
  cwd: string,
  claudeDir: string,
  id: string,
): MetricsSources {
  const git = cwd ? readGit(cwd) : null;
  return {
    git,
    // Only ask gh for a PR when the glance found a browsable remote. A remote-less repo can't have a PR,
    // so this skips a guaranteed-failing `gh pr view` spawn on every poll. A non-null remoteUrl means
    // origin resolved to an http/ssh host where gh might find one (gh auto-detects the host from it).
    pr: cwd && git && git.remoteUrl ? readPr(cwd, git.branch) : null,
    voice: cwd ? readVoiceEnabled(cwd, claudeDir) : null,
    remote: readRemoteControl(claudeDir, id),
  };
}

/** The composite change token: transcript mtime plus every source that should re-trigger a recompute. */
function metricsToken(mtimeMs: number, s: MetricsSources): number {
  return hashToken(
    `${mtimeMs}|${gitTokenStr(s.git)}|${prTokenStr(s.pr)}|${s.voice}|${s.remote}`,
  );
}

/** Assemble the lazy SessionMetrics from the precomputed token speed and the already-read sources. */
function buildMetrics(
  tokenSpeed: TokenSpeed | null,
  s: MetricsSources,
): SessionMetrics {
  return {
    tokenSpeed,
    git: s.git,
    pr: s.pr,
    voiceEnabled: s.voice,
    remoteControl: s.remote,
  };
}

/** A pid is alive if signalling it succeeds, or fails only because we lack permission. */
function defaultIsPidAlive(pid: number): boolean {
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

  // Last-resolved transcript path per session id. The Observed view polls one session every ~1.5s,
  // so caching the path lets a steady poll stat ONE file instead of re-walking all of projects/ each
  // time; the full sweep runs only on the first read or after the file moves/vanishes.
  const pathById = new Map<string, string>();
  // Stable per session: firstTranscriptCwd is the first row's cwd and never changes for a transcript, so
  // caching it lets a poll compute the metrics token (mtime + git/voice/remote) without re-reading the
  // JSONL — parity with readTranscript's token-before-read.
  const cwdById = new Map<string, string>();
  // Token speed is a pure function of the transcript rows, so cache it by the file mtime: a git/voice/
  // remote-only change (mtime unmoved) then rebuilds metrics without re-reading or re-parsing the JSONL.
  const speedById = new Map<
    string,
    { mtimeMs: number; speed: TokenSpeed | null }
  >();

  // Drop every per-session cache together: cwdById/speedById must never outlive their pathById entry, or a
  // re-resolved path (a moved/resumed transcript) would pair with a stale cwd or speed. readTranscript
  // shares pathById, so it invalidates through here too.
  const forgetSession = (id: string): void => {
    pathById.delete(id);
    cwdById.delete(id);
    speedById.delete(id);
  };

  // Compute + cache the token speed from already-read JSONL.
  const cacheSpeed = (
    id: string,
    mtimeMs: number,
    jsonl: string,
  ): TokenSpeed | null => {
    const speed = computeTokenSpeed(parseJsonlRows(jsonl), SPEED_WINDOW_MS);
    speedById.set(id, { mtimeMs, speed });
    return speed;
  };
  // Token speed for a session, re-reading+parsing the JSONL only when the mtime moved. `gone` when the
  // file vanished mid-read, so the caller can report absent.
  const readSpeed = (
    id: string,
    path: string,
    mtimeMs: number,
  ): { gone: true } | { gone: false; speed: TokenSpeed | null } => {
    const cached = speedById.get(id);
    if (cached && cached.mtimeMs === mtimeMs)
      return { gone: false, speed: cached.speed };
    const jsonl = readTextOrNull(path);
    if (jsonl === null) return { gone: true };
    return { gone: false, speed: cacheSpeed(id, mtimeMs, jsonl) };
  };

  // Resolve the transcript file for `id`: the cached path (re-stat'd) or a fresh projects/ sweep (freshest
  // wins if an id appears twice). Returns the path + its mtime, or null when nothing resolves. Owns
  // pathById and invalidates via forgetSession on a vanished file, so readTranscript and readMetrics can't
  // disagree on the id→file mapping.
  const resolveTranscript = (
    id: string,
  ): { path: string; mtimeMs: number } | null => {
    const cached = pathById.get(id);
    if (cached !== undefined) {
      try {
        return { path: cached, mtimeMs: statSync(cached).mtimeMs };
      } catch {
        forgetSession(id); // moved/deleted — fall through to a fresh sweep
      }
    }
    const hit = indexTranscripts(claudeDir).get(id);
    if (!hit) return null;
    pathById.set(id, hit.path);
    return { path: hit.path, mtimeMs: hit.mtimeMs };
  };

  return {
    id: "claude",
    // What Claude Code can do; the surfaces land in later issues, but the capability contract is stable.
    capabilities: { canControl: true, hasRateLimits: true, hasSubagents: true },
    listCandidates: () =>
      listCandidates({ claudeDir, isPidAlive, now: now(), recentWindowMs }),
    summarize: (c) => {
      const s = summarize(c);
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
    resolveAdoptTarget: (id) =>
      resolveAdoptTarget({ claudeDir, isPidAlive, id }),
    readTranscript: (id, sinceMtimeMs) => {
      try {
        const resolved = resolveTranscript(id);
        if (!resolved) return { status: "absent" };
        const { path, mtimeMs } = resolved;
        // The change token spans the transcript AND its subagent transcripts, so a running subagent
        // (which appends to its own file without touching the main transcript) still re-triggers a read.
        const subagentsDir = subagentsDirFor(path);
        const token = Math.max(mtimeMs, subagentsNewestMtime(subagentsDir));
        // Unchanged since the caller last saw it — skip the read AND the parse, not just the render.
        if (token === sinceMtimeMs)
          return { status: "unchanged", mtimeMs: token };

        const jsonl = readTextOrNull(path);
        if (jsonl === null) {
          forgetSession(id);
          return { status: "absent" }; // ENOENT — genuinely gone (bounding a large read is issue #20)
        }
        // Parse the JSONL once; the event projection and the subagent reconstruction share the rows.
        const rows = parseJsonlRows(jsonl);
        const sources = readSubagentSources(subagentsDir);
        const subagents = sources.length
          ? buildSubagentForest(rows, sources)
          : [];
        return {
          status: "changed",
          mtimeMs: token,
          doc: { ...parseTranscriptEventsFromRows(rows), subagents },
        };
      } catch {
        // A non-ENOENT read failure (EACCES, EIO, …) is transient, not absence. Degrade like
        // summarize does: report an error so the view keeps its last doc, rather than rejecting the
        // IPC or masquerading as "no transcript".
        return { status: "error" };
      }
    },
    readSubagentTranscript: (id, agentId, sinceMtimeMs) => {
      try {
        // We only need the session dir to locate the subagent file; the subagent file's own mtime is the
        // change token. So use the warm cached path (no stat of the main transcript) when present — the
        // parallel session poll keeps it fresh and invalidates a moved file — and pay the full resolve
        // (a projects/ sweep) only on a cold miss.
        const path = pathById.get(id) ?? resolveTranscript(id)?.path;
        if (path === undefined) return { status: "absent" };
        // `agentId` arrives over IPC. A real id is the slug between `agent-` and `.meta.json` in an
        // on-disk filename, so it can never hold a path separator; reject one that does rather than let
        // `agent-${agentId}.jsonl` escape the subagents dir (e.g. `x/../../other`). Genuinely absent.
        if (/[/\\]/.test(agentId)) return { status: "absent" };
        const file = subagentFileFor(path, agentId);
        let mtimeMs: number;
        try {
          mtimeMs = statSync(file).mtimeMs;
        } catch (err) {
          // No such subagent file (or no subagents dir) — genuinely absent. A non-ENOENT stat failure
          // (EACCES, EIO) is transient: rethrow to the outer catch so it degrades to `error`.
          if ((err as NodeJS.ErrnoException)?.code === "ENOENT")
            return { status: "absent" };
          throw err;
        }
        // Keyed on the subagent file alone — the tightest token: a live subagent appending re-triggers
        // the read, nothing else does.
        if (mtimeMs === sinceMtimeMs) return { status: "unchanged", mtimeMs };
        const jsonl = readTextOrNull(file);
        // Vanished between stat and read. Unlike readTranscript, no forgetSession here: a gone subagent
        // file doesn't mean the session moved, so its cached path stays valid.
        if (jsonl === null) return { status: "absent" };
        // A subagent's file is all-sidechain, so render it with the option on. The drill surface shows
        // only the event feed, so take just `events` and leave the session-shaped fields honestly empty:
        // waitingReason/turns/context computed over a subagent's internal turns are meaningless here (a
        // subagent's pending tool is not the Session waiting on you) and a trap for any future reader.
        // Nested drilling is a later issue, so the doc carries no forest of its own.
        const { events } = parseTranscriptEventsFromRows(
          parseJsonlRows(jsonl),
          {
            includeSidechain: true,
          },
        );
        return {
          status: "changed",
          mtimeMs,
          doc: {
            events,
            waitingReason: null,
            turns: [],
            context: null,
            subagents: [],
          },
        };
      } catch {
        return { status: "error" };
      }
    },
    readTasks: (id, sinceMtimeMs) => {
      try {
        const mtimeMs = tasksNewestMtime(claudeDir, id);
        if (mtimeMs === 0) return { status: "absent" }; // no tasks dir / no task files for this session
        if (mtimeMs === sinceMtimeMs) return { status: "unchanged", mtimeMs };
        return {
          status: "changed",
          mtimeMs,
          tasks: readTasksForSession(claudeDir, id),
        };
      } catch {
        return { status: "error" }; // transient read failure — caller keeps its last list
      }
    },
    readShells: (id, sinceMtimeMs): ShellsRead => {
      try {
        const resolved = resolveTranscript(id);
        if (!resolved) return { status: "absent" };
        const { path, mtimeMs } = resolved;
        if (mtimeMs === sinceMtimeMs) return { status: "unchanged", mtimeMs };
        const jsonl = readTextOrNull(path);
        if (jsonl === null) {
          forgetSession(id);
          return { status: "absent" };
        }
        // Strip outputFile: the list is renderer-facing; the log path stays server-side (readShellOutput).
        const shells = reconstructShells(parseJsonlRows(jsonl)).map(
          toBackgroundShell,
        );
        return { status: "changed", mtimeMs, shells };
      } catch {
        return { status: "error" };
      }
    },
    readShellOutput: (id, shellId, sinceMtimeMs): ShellOutputRead => {
      try {
        // `shellId` crosses IPC. A real id is alphanumeric (a backgroundTaskId), so reject a path
        // separator rather than risk an escape, even though the path comes from the transcript itself.
        if (/[/\\]/.test(shellId)) return { status: "absent" };
        const path = pathById.get(id) ?? resolveTranscript(id)?.path;
        if (path === undefined) return { status: "absent" };
        const jsonl = readTextOrNull(path);
        if (jsonl === null) return { status: "absent" };
        const rows = parseJsonlRows(jsonl);
        const shell = reconstructShells(rows).find((s) => s.id === shellId);
        if (!shell) return { status: "absent" };

        // Prefer the live .output file: its own mtime is the tightest change token.
        let outMtime = 0;
        try {
          outMtime = statSync(shell.outputFile).mtimeMs;
        } catch (err) {
          // ENOENT (or an empty path from an unparsed start line) → the live file is gone; fall back to
          // the stitched snapshot below. A non-ENOENT stat failure (EACCES, EIO) is transient, not
          // absence: rethrow so the outer catch degrades to `error` and the renderer keeps its last
          // value rather than flashing a stale snapshot. Mirrors readSubagentTranscript's split.
          if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
          outMtime = 0; // gone → snapshot fallback below
        }
        if (outMtime > 0) {
          if (outMtime === sinceMtimeMs)
            return { status: "unchanged", mtimeMs: outMtime };
          const raw = readTextOrNull(shell.outputFile);
          if (raw !== null) {
            const { text, truncatedBytes } = tailOutput(raw);
            return {
              status: "changed",
              mtimeMs: outMtime,
              output: { text, source: "live", truncatedBytes },
            };
          }
          // vanished between stat and read — fall through to the snapshot fallback
        }

        // Snapshot fallback: stitch the transcript's poll chunks. Token = transcript mtime.
        const tMtime = statSync(path).mtimeMs;
        if (tMtime === sinceMtimeMs)
          return { status: "unchanged", mtimeMs: tMtime };
        const { text, truncatedBytes } = tailOutput(
          stitchSnapshots(rows, shellId),
        );
        return {
          status: "changed",
          mtimeMs: tMtime,
          output: { text, source: "snapshot", truncatedBytes },
        };
      } catch {
        return { status: "error" };
      }
    },
    readMetrics: (id, sinceMtimeMs): MetricsRead => {
      try {
        const resolved = resolveTranscript(id);
        if (!resolved) return { status: "absent" };
        const { path, mtimeMs } = resolved;

        // --- fast unchanged path: cwd is known, so read the sources and token WITHOUT parsing the JSONL ---
        const cachedCwd = cwdById.get(id);
        if (cachedCwd !== undefined) {
          const sources = readSources(cachedCwd, claudeDir, id);
          const hashed = metricsToken(mtimeMs, sources);
          if (hashed === sinceMtimeMs)
            return { status: "unchanged", mtimeMs: hashed };
          const speed = readSpeed(id, path, mtimeMs);
          if (speed.gone) {
            forgetSession(id);
            return { status: "absent" };
          }
          return {
            status: "changed",
            mtimeMs: hashed,
            metrics: buildMetrics(speed.speed, sources),
          };
        }

        // --- cwd unknown (first read for this id): read the file to resolve it ---
        const jsonl = readTextOrNull(path);
        if (jsonl === null) {
          forgetSession(id);
          return { status: "absent" };
        }
        const cwd = firstTranscriptCwd(jsonl);
        // Cache only a resolved cwd: '' means no row carried one yet, so leave it unresolved and re-read
        // next poll rather than pinning git/voice to null for the session's life.
        if (cwd) cwdById.set(id, cwd);
        const sources = readSources(cwd, claudeDir, id);
        const hashed = metricsToken(mtimeMs, sources);
        if (hashed === sinceMtimeMs)
          return { status: "unchanged", mtimeMs: hashed };
        // We already hold the JSONL here, so compute + cache the speed from it directly.
        return {
          status: "changed",
          mtimeMs: hashed,
          metrics: buildMetrics(cacheSpeed(id, mtimeMs, jsonl), sources),
        };
      } catch {
        return { status: "error" };
      }
    },
  };
}
