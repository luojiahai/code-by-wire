import { execFile } from "node:child_process";
import type { PrInfo } from "@shared/metrics";
import { branchRowKey } from "@shared/stats";

// 30 s, ccstatusline's GIT_REVIEW_CACHE_TTL (A8). Misses are cached for the same TTL (entry.value =
// null below), so a branch with no PR doesn't shell out every poll.
const TTL_MS = 30_000;

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

// A packaged macOS app inherits launchd's minimal PATH, which cannot resolve a Homebrew-installed
// `gh`. The composition root recovers the user's login-shell PATH once at startup and supplies it
// here; dev and non-macOS builds leave this null and keep their inherited environment unchanged.
let correctedPath: string | null = null;

/** Build the gh child environment. GH_HOST must not pin work repos to a personal host, while a
 *  recovered PATH lets Finder-launched macOS builds resolve the same gh binary as the user's shell. */
export function prCommandEnv(
  base: NodeJS.ProcessEnv,
  path: string | null,
): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.GH_HOST;
  if (path) env.PATH = path;
  return env;
}

/** Supply the packaged app's recovered login-shell PATH before providers begin polling. */
export function configurePrPath(path: string | null): void {
  correctedPath = path;
}

/** Default runner: `gh pr view --json url,number,title,state,reviewDecision` in `cwd`, with GH_HOST
 *  stripped so gh auto-detects the host from the repo's remote (the work-vs-personal fix), and the
 *  packaged app's recovered PATH so Homebrew gh remains resolvable. No shell; resolves null on any
 *  error. */
function defaultRun(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "gh",
      ["pr", "view", "--json", "url,number,title,state,reviewDecision"],
      { cwd, env: prCommandEnv(process.env, correctedPath), timeout: 8000 },
      (err, stdout) => resolve(err ? null : stdout),
    );
  });
}

let runner: Runner = defaultRun;

/** Parse `gh pr view --json url,number,title,state,reviewDecision` stdout into a PrInfo, or null when
 *  absent/malformed. */
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
      const o = j as {
        number: number;
        url: string;
        title?: unknown;
        state?: unknown;
        reviewDecision?: unknown;
      };
      const pr: PrInfo = { number: o.number, url: o.url };
      if (typeof o.title === "string" && o.title) pr.title = o.title;
      if (typeof o.state === "string" && o.state) pr.state = o.state;
      if (typeof o.reviewDecision === "string" && o.reviewDecision)
        pr.reviewDecision = o.reviewDecision;
      return pr;
    }
  } catch {
    // not JSON
  }
  return null;
}

/** The branch's pull request for `cwd`, best-effort. Synchronous and non-blocking: returns the cached
 *  value (or null) immediately, and when the entry is stale/absent kicks a fire-and-forget gh fetch that
 *  populates the cache for the next poll. Cached per cwd+branch on a 30s TTL; null on every failure. */
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
