import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { AccountUsage } from "@shared/statusline";
import { parseUsageResponse } from "./parse";

export const USAGE_TTL_MS = 180_000;
export const ERROR_BACKOFF_MS = 30_000;
export const RATE_LIMIT_BACKOFF_MS = 300_000;
export const USAGE_TIMEOUT_MS = 5_000;
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

export interface UsageService {
  /** Last known usage, kicking off a background refresh when stale. Sync — never blocks the
   *  overview; the next 3 s poll picks a finished refresh up. Null before the first success. */
  read(): AccountUsage | null;
  /** When the last successful response was fetched (epoch ms; 0 before the first success) — the
   *  freshness the account's "as of Xm ago" readout reports. */
  fetchedAtMs(): number;
}

export interface UsageServiceDeps {
  /** The fetch surface the service actually uses — a string URL + init. Narrower than the global
   *  `fetch` (no URL/Request overload) so Electron's `net.fetch` satisfies it in prod; the global
   *  fetch and the test stubs satisfy it too (a wider parameter type is assignable here). */
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  /** Read the OAuth token fresh (≤1 per TTL). See credentials.ts. */
  readToken: () => Promise<string | null>;
  /** `<userData>/usage-cache.json` in prod; a temp dir in tests. Omit for memory-only. */
  cachePath?: string;
  /** Injected clock, per house style. */
  now?: () => number;
}

interface CacheFile {
  data: AccountUsage;
  fetchedAt: number;
  /** Truncated SHA-256 of the token that fetched `data` — invalidates on account switch. */
  tokenHash: string;
}

/** Retry-After arrives as integer seconds or an HTTP-date; ccstatusline parses both (audit). */
function parseRetryAfterMs(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}

export function createUsageService(deps: UsageServiceDeps): UsageService {
  const now = deps.now ?? ((): number => Date.now());
  let data: AccountUsage | null = null;
  let fetchedAt = 0;
  let tokenHash: string | null = null;
  let backoffUntil = 0;
  let inflight: Promise<void> | null = null;

  // Load the persisted cache once; its fingerprint is validated against the live token on the
  // first refresh cycle — construction does no keychain or network I/O.
  if (deps.cachePath) {
    try {
      const j = JSON.parse(
        readFileSync(deps.cachePath, "utf8"),
      ) as Partial<CacheFile>;
      if (
        j &&
        typeof j === "object" &&
        j.data &&
        typeof j.data === "object" &&
        typeof j.fetchedAt === "number" &&
        typeof j.tokenHash === "string"
      ) {
        data = j.data;
        fetchedAt = j.fetchedAt;
        tokenHash = j.tokenHash;
      }
    } catch {
      // absent or corrupt cache file reads as empty; the first fetch rebuilds it
    }
  }

  const fingerprint = (token: string): string =>
    createHash("sha256").update(token).digest("hex").slice(0, 16);

  const persist = (): void => {
    if (!deps.cachePath || !data || !tokenHash) return;
    try {
      const file: CacheFile = { data, fetchedAt, tokenHash };
      writeFileSync(deps.cachePath, JSON.stringify(file));
    } catch {
      // unwritable cache → memory-only operation; the numbers still serve
    }
  };

  const refresh = async (): Promise<void> => {
    // The token is read fresh per fetch — an account switch invalidates the cached numbers here.
    const token = await deps.readToken();
    if (!token) {
      // Missing/denied credentials: keep whatever data already showed (it may be the same
      // account's), just stop hammering the keychain for 30 s.
      backoffUntil = now() + ERROR_BACKOFF_MS;
      return;
    }
    const hash = fingerprint(token);
    if (tokenHash !== null && tokenHash !== hash) {
      // Account switch: the cached numbers belong to another account. Drop before fetching, so
      // even a failed fetch can't show them.
      data = null;
      fetchedAt = 0;
    }
    tokenHash = hash;
    let res: Response;
    try {
      res = await deps.fetchFn(USAGE_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
        },
        signal: AbortSignal.timeout(USAGE_TIMEOUT_MS),
      });
    } catch {
      backoffUntil = now() + ERROR_BACKOFF_MS; // network error or the 5 s abort
      return;
    }
    if (res.status === 429) {
      backoffUntil =
        now() +
        (parseRetryAfterMs(res.headers.get("retry-after"), now()) ??
          RATE_LIMIT_BACKOFF_MS);
      return;
    }
    if (!res.ok) {
      backoffUntil = now() + ERROR_BACKOFF_MS;
      return;
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      backoffUntil = now() + ERROR_BACKOFF_MS;
      return;
    }
    const parsed = parseUsageResponse(body);
    if (!parsed) {
      backoffUntil = now() + ERROR_BACKOFF_MS; // malformed 200 → keep last good data
      return;
    }
    data = parsed;
    fetchedAt = now();
    backoffUntil = 0;
    persist();
  };

  return {
    read(): AccountUsage | null {
      const t = now();
      const fresh = data !== null && t - fetchedAt < USAGE_TTL_MS;
      if (!fresh && !inflight && t >= backoffUntil) {
        // Single-flight, deliberately not awaited: the promise is tracked only so a second stale
        // read can't spawn a second fetch. Failures land in backoffUntil, never throw out of here.
        inflight = refresh().finally(() => {
          inflight = null;
        });
      }
      return data;
    },
    fetchedAtMs(): number {
      return fetchedAt;
    },
  };
}
