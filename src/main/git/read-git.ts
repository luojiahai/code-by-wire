import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { GitInfo } from "@shared/metrics";

const TTL_MS = 5000;
// Per cwd: the resolved .git dir (null = not a work tree), the HEAD/index mtime token the value was
// computed at, the value, and a TTL backstop. Caching gitDir lets a steady poll stat HEAD/index instead
// of forking `git rev-parse` every time; the null verdict is cached the same way so a repo-less cwd is
// re-probed at most once per TTL rather than once per poll.
const cache = new Map<
  string,
  {
    gitDir: string | null;
    token: string;
    expiry: number;
    value: GitInfo | null;
  }
>();

/** A non-throwing git invocation: trimmed stdout, or null on any failure (not a repo, no upstream, …). */
function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    }).trim();
  } catch {
    return null;
  }
}

/** Sum insertions/deletions from a `git diff --shortstat` line. Absent numbers are 0. */
function parseShortstat(out: string | null): {
  insertions: number;
  deletions: number;
} {
  if (!out) return { insertions: 0, deletions: 0 };
  const ins = /(\d+) insertion/.exec(out);
  const del = /(\d+) deletion/.exec(out);
  return {
    insertions: ins ? Number(ins[1]) : 0,
    deletions: del ? Number(del[1]) : 0,
  };
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
function resolveGitDir(cwd: string): string | null {
  if (git(cwd, ["rev-parse", "--is-inside-work-tree"]) !== "true") return null;
  const gitDir = git(cwd, ["rev-parse", "--git-dir"]);
  if (gitDir === null) return null;
  return joinGitDir(cwd, gitDir);
}

/** Cheap freshness token with no spawn: the mtimes of HEAD and index. A commit/checkout/stage moves one
 *  immediately; an unstaged working-tree edit touches neither, so the TTL is the backstop for that. */
function mtimeToken(gitDir: string): string {
  const m = (p: string): number => {
    try {
      return statSync(join(gitDir, p)).mtimeMs;
    } catch {
      return 0;
    }
  };
  return `${m("HEAD")}:${m("index")}`;
}

/** Read the local git glance for `cwd`. null when `cwd` isn't a work tree. Cached per cwd on the
 *  HEAD/index mtimes plus a 5s TTL, so a steady metrics poll forks git only on a change or once per TTL. */
export function readGit(cwd: string): GitInfo | null {
  const now = Date.now();
  const hit = cache.get(cwd);
  const fresh = hit !== undefined && hit.expiry > now;
  // A cached non-repo within the TTL: no spawn, and don't bump expiry or a steadily-polled cwd would never
  // be re-probed after a `git init`.
  if (fresh && hit.gitDir === null) return null;

  // gitDir is stable for a cwd, so resolve it (the spawns) only on first sight or after the TTL.
  const gitDir = fresh ? hit.gitDir : resolveGitDir(cwd);
  if (gitDir === null) {
    cache.set(cwd, {
      gitDir: null,
      token: "",
      expiry: now + TTL_MS,
      value: null,
    });
    return null;
  }

  // Within the TTL and HEAD/index unmoved → serve the cached glance with no detail spawns.
  const token = mtimeToken(gitDir);
  if (fresh && hit.token === token) return hit.value;

  // Recompute: a moved token, or the TTL expired (the unstaged-edit backstop).
  const branchRaw = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchRaw && branchRaw !== "HEAD" ? branchRaw : null;
  const sha = git(cwd, ["rev-parse", "--short", "HEAD"]);
  const unstaged = parseShortstat(git(cwd, ["diff", "--shortstat"]));
  const staged = parseShortstat(git(cwd, ["diff", "--cached", "--shortstat"]));
  const porcelain = git(cwd, ["status", "--porcelain"]);
  const ab = git(cwd, [
    "rev-list",
    "--left-right",
    "--count",
    "HEAD...@{upstream}",
  ]);
  let ahead: number | null = null;
  let behind: number | null = null;
  if (ab) {
    const [a, b] = ab.split(/\s+/).map((n) => Number(n));
    if (Number.isFinite(a) && Number.isFinite(b)) {
      ahead = a;
      behind = b;
    }
  }
  const remoteUrl = normalizeRemoteUrl(
    git(cwd, ["remote", "get-url", "origin"]),
  );
  const value: GitInfo = {
    branch,
    insertions: unstaged.insertions + staged.insertions,
    deletions: unstaged.deletions + staged.deletions,
    ahead,
    behind,
    sha: sha || null,
    dirty: porcelain !== null && porcelain.length > 0,
    remoteUrl,
  };
  cache.set(cwd, { gitDir, token, expiry: now + TTL_MS, value });
  return value;
}
