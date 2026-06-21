import { execFile } from "node:child_process";
import type { PrInfo } from "@shared/metrics";
import { branchRowKey } from "@shared/stats";

const TTL_MS = 60_000;

/** Runs `gh pr view` for a repo and returns raw stdout, or null on any failure. A seam so the cache
 *  logic is unit-testable and the integration tests never spawn gh. */
type Runner = (cwd: string) => Promise<string | null>;
/** A clock seam so the TTL is testable without real time. */
type Clock = () => number;

interface Entry {
  value: PrInfo | null;
  expiry: number;
  fetching: boolean;
}

const cache = new Map<string, Entry>();

/** Default runner: `gh pr view --json number,url` in `cwd`, with GH_HOST stripped so gh auto-detects the
 *  host from the repo's remote (the work-vs-personal fix). No shell; resolves null on any error. */
function defaultRun(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.GH_HOST;
    execFile(
      "gh",
      ["pr", "view", "--json", "number,url"],
      { cwd, env, timeout: 8000 },
      (err, stdout) => resolve(err ? null : stdout),
    );
  });
}

let runner: Runner = defaultRun;

/** Parse `gh pr view --json number,url` stdout into a PrInfo, or null when absent/malformed. */
function parsePr(out: string | null): PrInfo | null {
  if (!out) return null;
  try {
    const j: unknown = JSON.parse(out);
    if (
      j !== null &&
      typeof j === "object" &&
      typeof (j as { number?: unknown }).number === "number" &&
      typeof (j as { url?: unknown }).url === "string"
    ) {
      const o = j as { number: number; url: string };
      return { number: o.number, url: o.url };
    }
  } catch {
    // not JSON
  }
  return null;
}

/** The branch's pull request for `cwd`, best-effort. Synchronous and non-blocking: returns the cached
 *  value (or null) immediately, and when the entry is stale/absent kicks a fire-and-forget gh fetch that
 *  populates the cache for the next poll. Cached per cwd+branch on a 60s TTL; null on every failure. */
export function readPr(
  cwd: string,
  branch: string | null,
  now: Clock = Date.now,
): PrInfo | null {
  if (!cwd || !branch) return null;
  const key = branchRowKey(cwd, branch); // the same NUL-joined cwd+branch key the analytics store uses
  const hit = cache.get(key);
  const t = now();
  if (hit && hit.expiry > t) return hit.value; // fresh
  if (!hit || !hit.fetching) {
    const entry: Entry = hit ?? { value: null, expiry: 0, fetching: false };
    entry.fetching = true;
    cache.set(key, entry);
    void runner(cwd)
      .then((out) => {
        entry.value = parsePr(out);
        entry.expiry = now() + TTL_MS;
        entry.fetching = false;
      })
      .catch(() => {
        entry.value = null;
        entry.expiry = now() + TTL_MS;
        entry.fetching = false;
      });
  }
  return hit ? hit.value : null;
}

/** Test seam: replace the gh runner (also keeps the integration tests from spawning gh). */
export function _setPrRunner(r: Runner): void {
  runner = r;
}

/** Test seam: clear the per-cwd+branch cache between tests. */
export function _resetPrCache(): void {
  cache.clear();
}
