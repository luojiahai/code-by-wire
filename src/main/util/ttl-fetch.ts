/**
 * Lazy TTL-cached single-flight fetch, agent-neutral. read() is sync and never blocks: it returns
 * the last good value and, when stale, spawns a background refresh the NEXT call picks up — the
 * same no-timers contract as usage/fetch.ts's createUsageService, extracted for reuse by any
 * provider's account-scoped telemetry (codex limits today; future agents tomorrow). A fetch that
 * resolves null or throws is a failure: the last good value is kept and the failure TTL backs off
 * the next attempt.
 */
export interface TtlFetchDeps<T> {
  fetch: () => Promise<T | null>;
  successTtlMs: number;
  failureTtlMs: number;
  /** Injected clock, per house style. */
  now?: () => number;
}

export interface TtlFetch<T> {
  read(): T | null;
}

export function createTtlFetch<T>(deps: TtlFetchDeps<T>): TtlFetch<T> {
  const now = deps.now ?? ((): number => Date.now());
  let data: T | null = null;
  let nextAttemptAt = 0;
  let inflight: Promise<void> | null = null;

  const refresh = async (): Promise<void> => {
    let result: T | null;
    try {
      result = await deps.fetch();
    } catch {
      result = null;
    }
    if (result !== null) {
      data = result;
      nextAttemptAt = now() + deps.successTtlMs;
    } else {
      nextAttemptAt = now() + deps.failureTtlMs;
    }
  };

  return {
    read(): T | null {
      if (now() >= nextAttemptAt && !inflight) {
        // Single-flight, deliberately not awaited (see createUsageService.read()).
        inflight = refresh().finally(() => {
          inflight = null;
        });
      }
      return data;
    },
  };
}
