import type { PersistedSession, SessionCandidate } from "@shared/types";
import type { ToolResultDetail, TranscriptReadWire } from "@shared/transcript";
import { toTranscriptWire } from "@shared/transcript";
import type { MetricsRead } from "@shared/metrics";
import type {
  MonitorOutputRead,
  MonitorsRead,
  ShellOutputRead,
  ShellsRead,
  TaskRead,
} from "@shared/ipc";
import {
  readSessionFiles,
  summarize,
  type RawSessionFile,
} from "../provider/claude/discover";
import { defaultIsPidAlive } from "../provider/claude";
import {
  createClaudeReader,
  type ClaudeReader,
} from "../provider/claude/reader";
import {
  scanClaimableRollouts,
  type ClaimableRollout,
} from "../provider/codex/claim";
import { listRollouts, readRolloutHead } from "../provider/codex/rollout";

/**
 * The parse-worker request vocabulary: every op is one poll-driven fs read the main thread used to
 * pay for (issue #432). `seq` correlates the response — the callers serialize some flows today, but
 * the protocol must not depend on that. Config that lives in main (claudeDir/codexDir, the clock,
 * the recency window, the claimed-rollout set) rides each request rather than worker state, so the
 * worker holds nothing main has to keep in sync — only per-dir perf caches that self-heal.
 */
export type ParseRequestBody =
  | { op: "summarize"; candidate: SessionCandidate }
  | {
      op: "listCandidates";
      claudeDir: string;
      now: number;
      recentWindowMs: number;
    }
  | { op: "readTranscript"; claudeDir: string; id: string; since?: number }
  | {
      op: "readSubagentTranscript";
      claudeDir: string;
      id: string;
      agentId: string;
      since?: number;
    }
  | {
      op: "getToolResult";
      claudeDir: string;
      id: string;
      toolUseId: string;
      agentId?: string;
    }
  | { op: "readTasks"; claudeDir: string; id: string; since?: number }
  | { op: "readShells"; claudeDir: string; id: string; since?: number }
  | {
      op: "readShellOutput";
      claudeDir: string;
      id: string;
      shellId: string;
      since?: number;
    }
  | { op: "readMonitors"; claudeDir: string; id: string; since?: number }
  | {
      op: "readMonitorOutput";
      claudeDir: string;
      id: string;
      monitorId: string;
      since?: number;
    }
  | { op: "readMetrics"; claudeDir: string; id: string; since?: number }
  | { op: "readSessionFiles"; claudeDir: string }
  | {
      op: "scanClaimableRollouts";
      codexDir: string;
      earliestMs: number;
      claimedPaths: string[];
    };

export type ParseRequest = { seq: number } & ParseRequestBody;

/** What each op resolves to on the client. The wire response carries `result` untyped (it crosses a
 *  process boundary); this map is the single place the op → payload contract is written down. */
export interface ParseOpResults {
  summarize: PersistedSession;
  listCandidates: SessionCandidate[];
  readTranscript: TranscriptReadWire;
  readSubagentTranscript: TranscriptReadWire;
  getToolResult: ToolResultDetail;
  readTasks: TaskRead;
  readShells: ShellsRead;
  readShellOutput: ShellOutputRead;
  readMonitors: MonitorsRead;
  readMonitorOutput: MonitorOutputRead;
  readMetrics: MetricsRead;
  readSessionFiles: RawSessionFile[];
  scanClaimableRollouts: ClaimableRollout[];
}

export type ParseOp = keyof ParseOpResults;

export type ParseResponse =
  | { seq: number; ok: true; result: unknown }
  | { seq: number; ok: false; error: string };

/** Test seams for the handler; production uses the real reader/fs implementations. */
export interface ParseHandlerDeps {
  /** The per-claudeDir reader. The default memoizes one instance per dir for the worker's life, so
   *  its path/speed/session-kind caches persist across requests like the provider's do in main. */
  readerFor?: (claudeDir: string) => ClaudeReader;
  parse?: (c: SessionCandidate) => PersistedSession;
  readSessionFiles?: (claudeDir: string) => RawSessionFile[];
  scanRollouts?: (
    codexDir: string,
    earliestMs: number,
    claimedPaths: string[],
  ) => ClaimableRollout[];
}

/**
 * The worker's whole brain, pure-constructible so it's testable without a utility process: serve
 * each request with the same code the provider falls back to in-process, never throw — a failure
 * travels back as `ok:false` and the client's caller decides (the provider retries in-process).
 * Management/model adornment stays with the provider in main; this side is a function of the
 * filesystem plus per-dir perf caches.
 */
export function createParseRequestHandler(
  deps: ParseHandlerDeps = {},
): (req: ParseRequest) => ParseResponse {
  const readers = new Map<string, ClaudeReader>();
  const readerFor =
    deps.readerFor ??
    ((claudeDir: string): ClaudeReader => {
      let r = readers.get(claudeDir);
      if (!r) {
        r = createClaudeReader({ claudeDir, isPidAlive: defaultIsPidAlive });
        readers.set(claudeDir, r);
      }
      return r;
    });
  const parse = deps.parse ?? summarize;
  const sessionFiles = deps.readSessionFiles ?? readSessionFiles;
  const scanRollouts =
    deps.scanRollouts ??
    ((codexDir: string, earliestMs: number, claimedPaths: string[]) =>
      scanClaimableRollouts({
        listRollouts: () => listRollouts(codexDir),
        readHead: readRolloutHead,
        earliestMs,
        claimedRollouts: new Set(claimedPaths),
      }));

  const serve = (req: ParseRequest): unknown => {
    switch (req.op) {
      case "summarize":
        return parse(req.candidate);
      case "listCandidates":
        return readerFor(req.claudeDir).listCandidates({
          now: req.now,
          recentWindowMs: req.recentWindowMs,
        });
      case "readTranscript":
        // Stringify HERE, in the worker: the doc then crosses both hops (worker→main, main→renderer)
        // as one memcpy-cheap string — see TranscriptReadWire.
        return toTranscriptWire(
          readerFor(req.claudeDir).readTranscript(req.id, req.since),
        );
      case "readSubagentTranscript":
        return toTranscriptWire(
          readerFor(req.claudeDir).readSubagentTranscript(
            req.id,
            req.agentId,
            req.since,
          ),
        );
      case "getToolResult":
        return readerFor(req.claudeDir).getToolResult(
          req.id,
          req.toolUseId,
          req.agentId,
        );
      case "readTasks":
        return readerFor(req.claudeDir).readTasks(req.id, req.since);
      case "readShells":
        return readerFor(req.claudeDir).readShells(req.id, req.since);
      case "readShellOutput":
        return readerFor(req.claudeDir).readShellOutput(
          req.id,
          req.shellId,
          req.since,
        );
      case "readMonitors":
        return readerFor(req.claudeDir).readMonitors(req.id, req.since);
      case "readMonitorOutput":
        return readerFor(req.claudeDir).readMonitorOutput(
          req.id,
          req.monitorId,
          req.since,
        );
      case "readMetrics":
        return readerFor(req.claudeDir).readMetrics(req.id, req.since);
      case "readSessionFiles":
        return sessionFiles(req.claudeDir);
      case "scanClaimableRollouts":
        return scanRollouts(req.codexDir, req.earliestMs, req.claimedPaths);
    }
  };

  return (req) => {
    try {
      return { seq: req.seq, ok: true, result: serve(req) };
    } catch (err) {
      return {
        seq: req.seq,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}
