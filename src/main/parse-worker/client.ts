import { utilityProcess, type UtilityProcess } from "electron";
import type { PersistedSession, SessionCandidate } from "@shared/types";
import type { ParseRequest, ParseResponse } from "./protocol";
import { logError, logWarn } from "../log-buffer";

/** A hung worker must not wedge the sync pass forever; past this the request rejects (the provider
 *  parses in-process) and the worker is killed so the next call gets a fresh one. Generous: the
 *  worst measured in-process parse was ~0.5s, so 30s only trips on a genuinely stuck process. */
const REQUEST_TIMEOUT_MS = 30_000;

/** After this many worker deaths with no successful round-trip in between, stop respawning — a
 *  worker that can't boot (bad bundle, missing file) would otherwise crash-loop on every poll.
 *  Every summarize then rejects and the provider parses in-process for the rest of the run. */
const MAX_CONSECUTIVE_CRASHES = 3;

export interface ParseWorkerClient {
  summarize(c: SessionCandidate): Promise<PersistedSession>;
  dispose(): void;
}

/**
 * Main-side handle on the parse-worker utility process: request/response with seq correlation over
 * the parent port. Lazy — the process forks on the first summarize, so app launch pays nothing.
 * Failure contract: any fault (spawn failure, crash, timeout, ok:false response) surfaces as a
 * rejection, and the claude provider's summarize catches it and parses in-process — degraded to
 * the old jank for that pass, but never a lost row.
 */
export function createParseWorkerClient(modulePath: string): ParseWorkerClient {
  let child: UtilityProcess | null = null;
  let seq = 0;
  let consecutiveCrashes = 0;
  let disposed = false;
  const pending = new Map<
    number,
    {
      resolve: (s: PersistedSession) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const rejectAll = (why: string): void => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(why));
    }
    pending.clear();
  };

  const spawn = (): UtilityProcess => {
    const c = utilityProcess.fork(modulePath, [], {
      serviceName: "code-by-wire transcript parse",
    });
    c.on("message", (msg: ParseResponse) => {
      consecutiveCrashes = 0; // a round-trip proves the bundle boots and answers
      const p = pending.get(msg.seq);
      if (!p) return; // timed-out request whose reply arrived late
      pending.delete(msg.seq);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.session);
      else p.reject(new Error(msg.error));
    });
    c.on("exit", (code) => {
      if (child === c) child = null;
      if (disposed) return;
      consecutiveCrashes++;
      if (consecutiveCrashes >= MAX_CONSECUTIVE_CRASHES) {
        logError(
          "parse-worker-crash-loop",
          `parse worker died ${consecutiveCrashes}x without a successful reply; ` +
            "parsing in-process for the rest of this run",
          new Error(`exit code ${code}`),
        );
      } else {
        logWarn(
          "parse-worker-exited",
          `parse worker exited (code ${code}); respawning on next parse`,
        );
      }
      rejectAll(`parse worker exited (code ${code})`);
    });
    return c;
  };

  return {
    summarize(candidate: SessionCandidate): Promise<PersistedSession> {
      if (disposed) return Promise.reject(new Error("parse worker disposed"));
      if (consecutiveCrashes >= MAX_CONSECUTIVE_CRASHES)
        return Promise.reject(new Error("parse worker crash-looped"));
      try {
        child ??= spawn();
      } catch (err) {
        return Promise.reject(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
      const c = child;
      const id = ++seq;
      return new Promise<PersistedSession>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("parse worker timed out"));
          // A stuck worker stays stuck; kill it so the next request starts clean. The exit
          // handler rejects any other pending requests.
          if (child === c) child = null;
          c.kill();
        }, REQUEST_TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        const req: ParseRequest = { seq: id, candidate };
        c.postMessage(req);
      });
    },
    dispose(): void {
      disposed = true;
      rejectAll("parse worker disposed");
      child?.kill();
      child = null;
    },
  };
}
