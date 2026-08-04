import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { GitInfo } from "@shared/metrics";

const TTL_MS = 5000;

/** A hung git (e.g. a wedged fs) must not pin `fetching` forever — past this the spawn resolves
 *  null and the entry settles, so the next poll can retry. */
const SPAWN_TIMEOUT_MS = 8000;

// Per cwd: the resolved .git dir (null = not a work tree, undefined = never resolved), the HEAD
// mtime token the value was computed at, the value, a TTL backstop, and the in-flight refresh.
// Caching gitDir lets a steady poll stat HEAD instead of forking `git rev-parse` every time; the
// null verdict is cached the same way so a repo-less cwd is re-probed at most once per TTL.
interface Entry {
  gitDir?: string | null;
  token: string;
  expiry: number;
  value: GitInfo | null;
  fetching: boolean;
}

const cache = new Map<string, Entry>();

/** In-flight refreshes, for the test seam that awaits them (`_flushGitReads`). */
const inFlight = new Set<Promise<void>>();

/** A non-throwing async git invocation: trimmed stdout, or null on any failure (not a repo, no
 *  upstream, …). execFile, never execFileSync: readGit runs inside the metrics poll, and a spawn
 *  on first sight / TTL expiry / branch switch used to block the caller's thread (#432 item 7). */
function git(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
        timeout: SPAWN_TIMEOUT_MS,
      },
      (err, stdout) => resolve(err ? null : stdout.trim()),
    );
  });
}

/** A minimal slice of `node:path` — the host module by default, or `path.win32`/`path.posix` for
 *  deterministic cross-platform tests. */
export interface PathOps {
  isAbsolute: (p: string) => boolean;
  join: (...parts: string[]) => string;
}

/** Resolve git's reported --git-dir against cwd. git returns a relative `.git` in the common case but an
 *  absolute path for worktrees; `isAbsolute` recognizes both POSIX (`/…`) and Windows (`C:\…`) absolutes,
 *  unlike a `startsWith('/')` check. `pathOps` is injected so the platform behavior is unit-testable on any
 *  host (tests pass `path.win32`/`path.posix`); production uses the host `node:path`. */
export function joinGitDir(
  cwd: string,
  gitDir: string,
  pathOps: PathOps = { isAbsolute, join },
): string {
  return pathOps.isAbsolute(gitDir) ? gitDir : pathOps.join(cwd, gitDir);
}

/** Normalize a `git remote` URL into a browsable https URL, or null when it can't be. Handles the three
 *  common forms: scp-style SSH (`git@host:owner/repo(.git)`), `ssh://[user@]host[:port]/owner/repo(.git)`,
 *  and `http(s)://host/owner/repo(.git)`. Best-effort and host-agnostic: the ssh port is dropped (the web
 *  serves over https), a trailing `.git` is stripped, and anything else (git://, file://, empty) is null. */
export function normalizeRemoteUrl(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const stripGit = (s: string): string => s.replace(/\.git$/, "");

  // scp-style: user@host:owner/repo.git — no scheme, a colon between host and path.
  const scp = /^[^@/]+@([^:/]+):(.+)$/.exec(trimmed);
  if (scp) {
    const path = stripGit(scp[2].replace(/^\/+/, ""));
    return path ? `https://${scp[1]}/${path}` : null;
  }

  // ssh:// and http(s):// parse as URLs; git:// and file:// fall through to null.
  try {
    const u = new URL(trimmed);
    if (
      u.protocol === "ssh:" ||
      u.protocol === "http:" ||
      u.protocol === "https:"
    ) {
      const path = stripGit(u.pathname).replace(/^\/+/, "");
      if (!u.hostname || !path) return null;
      return `https://${u.hostname}/${path}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** Resolve the absolute .git dir for `cwd`, or null when `cwd` isn't a work tree (a bare repo or the
 *  .git dir itself counts as "no glance"). Two spawns, run only on first sight or after the TTL. */
async function resolveGitDir(cwd: string): Promise<string | null> {
  if ((await git(cwd, ["rev-parse", "--is-inside-work-tree"])) !== "true")
    return null;
  const gitDir = await git(cwd, ["rev-parse", "--git-dir"]);
  if (gitDir === null) return null;
  return joinGitDir(cwd, gitDir);
}

/** Cheap freshness token with no spawn: HEAD's mtime. A checkout/branch switch moves it immediately;
 *  a commit or a remote add/set-url touches nothing we stat, so the TTL is the backstop for those. */
function mtimeToken(gitDir: string): string {
  try {
    return String(statSync(join(gitDir, "HEAD")).mtimeMs);
  } catch {
    return "0";
  }
}

/** Recompute an entry off-thread: resolve the .git dir when unknown (or when the TTL wants the
 *  repo-ness re-probed), then the branch + remote detail spawns. Settles the entry's TTL and clears
 *  `fetching` whatever happens, so a failed pass retries on the next stale poll. */
async function refresh(
  cwd: string,
  entry: Entry,
  gitDir?: string | null,
): Promise<void> {
  try {
    const resolved = gitDir ?? (await resolveGitDir(cwd));
    entry.gitDir = resolved;
    if (resolved === null) {
      entry.token = "";
      entry.value = null;
      return;
    }
    // Token BEFORE the detail spawns: if HEAD moves mid-refresh the token is already stale, so the
    // next poll sees the mismatch and refreshes again rather than trusting a torn read.
    const token = mtimeToken(resolved);
    const branch =
      (await git(cwd, ["symbolic-ref", "--short", "HEAD"])) || null;
    const remoteUrl = normalizeRemoteUrl(
      await git(cwd, ["remote", "get-url", "origin"]),
    );
    entry.value = { branch, remoteUrl };
    entry.token = token;
  } finally {
    entry.expiry = Date.now() + TTL_MS;
    entry.fetching = false;
  }
}

/** Start a refresh unless one is already in flight for this entry. `gitDir` short-circuits the
 *  resolve spawns when the caller knows the repo (a token-move refresh within the TTL). */
function kickRefresh(cwd: string, entry: Entry, gitDir?: string | null): void {
  if (entry.fetching) return;
  entry.fetching = true;
  const p = refresh(cwd, entry, gitDir).catch(() => {
    entry.fetching = false; // refresh never throws by construction; belt and suspenders
  });
  inFlight.add(p);
  void p.finally(() => inFlight.delete(p));
}

/**
 * Read the local git glance for `cwd`. Synchronous and non-blocking, mirroring readPr: the cached
 * value (or null) returns immediately, and when the entry is stale — first sight, TTL expiry, or a
 * HEAD-mtime move (a checkout lands on the next poll) — a fire-and-forget refresh recomputes it for
 * the poll after. Cached per cwd on HEAD's mtime plus a 5s TTL, so a steady metrics poll forks git
 * only on a branch change or once per TTL, and never on the calling thread.
 */
export function readGit(cwd: string): GitInfo | null {
  const now = Date.now();
  let entry = cache.get(cwd);
  if (!entry) {
    entry = { token: "", expiry: 0, value: null, fetching: false };
    cache.set(cwd, entry);
  }
  const fresh = entry.expiry > now;

  // A cached non-repo within the TTL: no spawn, and don't bump expiry or a steadily-polled cwd would
  // never be re-probed after a `git init`.
  if (fresh && entry.gitDir === null) return null;

  if (fresh && entry.gitDir !== undefined && entry.gitDir !== null) {
    // Within the TTL and HEAD unmoved → the cached glance stands, no spawns of any kind.
    if (entry.token === mtimeToken(entry.gitDir)) return entry.value;
    // HEAD moved (checkout/branch switch): serve the last glance once more and refresh with the
    // known gitDir — only the two detail spawns run.
    kickRefresh(cwd, entry, entry.gitDir);
    return entry.value;
  }

  // First sight or TTL expiry: full refresh (repo-ness re-probed). Serve what we have meanwhile.
  kickRefresh(cwd, entry);
  return entry.value;
}

/** Test seam: resolve when every in-flight refresh has settled. */
export function _flushGitReads(): Promise<void> {
  return Promise.all([...inFlight]).then(() => undefined);
}

/** Test seam: clear the per-cwd cache between tests. */
export function _resetGitCache(): void {
  cache.clear();
}
