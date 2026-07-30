import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
import type { SessionWorktree } from "@shared/types";
import { joinGitDir, type PathOps } from "./read-git";

/** One durable cwd → main-checkout mapping row, the shape the analytics store persists. Recorded
 *  while the worktree directory still exists so its sessions keep merging after it's deleted. Only
 *  linked worktrees are persisted: a main checkout's root re-resolves from git for free, and
 *  persisting one would mean an analytics schema change for a value the origin already implies. */
export interface WorktreeRow {
  cwd: string;
  repoRoot: string;
  name: string;
}

/** The persistence seam the map reads at startup and writes on first detection. Both sides are
 *  best-effort: a throwing store must not cost the overview. */
export interface WorktreeStore {
  load(): WorktreeRow[];
  save(row: WorktreeRow): void;
}

/** Raw `git rev-parse --git-dir --git-common-dir --show-toplevel` output for a cwd, or null on any
 *  failure (not a repo, git missing, or the cwd no longer exists). Injected for tests. */
export type RevParse = (cwd: string) => string | null;

/** The `node:path` slice this module needs — the host module by default, or `path.win32`/`path.posix`
 *  for deterministic cross-platform tests (the injection pattern read-git.ts already uses). */
export interface RepoPathOps extends PathOps {
  basename: (p: string) => string;
  dirname: (p: string) => string;
  sep: string;
}

const hostPath: RepoPathOps = { isAbsolute, join, basename, dirname, sep };

const revParse: RevParse = (cwd) => {
  try {
    return execFileSync(
      "git",
      ["rev-parse", "--git-dir", "--git-common-dir", "--show-toplevel"],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      },
    );
  } catch {
    return null;
  }
};

/**
 * A directory's stable project identity: the folder every session started inside it groups under,
 * plus that folder's display name. `worktree` is present ONLY for a linked checkout — its presence
 * is what drives the sidebar's worktree badge, so a main checkout must never carry one.
 */
export interface RepoIdentity {
  /** The canonical grouping key: the repository's root, else the (canonicalized) origin itself. */
  repoRoot: string;
  /** basename(repoRoot) — the sidebar folder's label, ready to render. */
  repoLabel: string;
  /** Set when the origin is inside a linked git worktree that folded into `repoRoot`. */
  worktree?: SessionWorktree;
}

/** Is `p` a filesystem root ("/", "C:\")? `dirname` is idempotent exactly there. */
function isFsRoot(p: string, path: RepoPathOps): boolean {
  return path.dirname(p) === p;
}

/** A root's folder label: its base name, or the path itself when it has none (a bare drive). */
function labelOf(root: string, path: RepoPathOps): string {
  return path.basename(root) || root;
}

/**
 * One canonical spelling for a path, so the same directory can never split into two folders: git's
 * separators are rewritten to the platform's (git reports `C:/x` where Windows spells `C:\x`) and a
 * trailing separator is dropped. Deliberately NOT case-folded — git returns the on-disk spelling and
 * folding would corrupt the label the sidebar renders. On POSIX a backslash is a legal filename
 * character, so separators are rewritten only where the platform separator IS the backslash.
 */
function canonicalPath(p: string, path: RepoPathOps = hostPath): string {
  if (!p) return "";
  let out = path.sep === "\\" ? p.replace(/\//g, "\\") : p;
  while (
    out.length > 1 &&
    (out.endsWith("/") || out.endsWith("\\")) &&
    !isFsRoot(out, path)
  )
    out = out.slice(0, -1);
  return out;
}

export interface RepoIdentityOptions {
  /** The user's home directory — never itself a project folder (see the junk-root guard). */
  homeDir?: string;
  path?: RepoPathOps;
}

/**
 * Resolve a directory's project identity from rev-parse output. Pure: every branch is reachable
 * without spawning git.
 *
 * The root is the parent of the common git directory when that directory is named `.git` (this is
 * what folds a linked worktree into its main checkout), else the repository top level, else — when
 * the origin isn't in a repository at all, or git failed — the origin itself.
 *
 * Junk-root guard: a resolved root that IS the home directory or a filesystem root is discarded in
 * favour of the origin. Without it, a `git init`'d home would swallow every session in the app into
 * one catch-all folder. A worktree whose fold the guard rejects loses its descriptor too — nothing
 * merged, so there is nothing for the badge to point at.
 */
export function parseRepoIdentity(
  origin: string,
  out: string | null,
  { homeDir = homedir(), path = hostPath }: RepoIdentityOptions = {},
): RepoIdentity {
  const canonicalOrigin = canonicalPath(origin, path);
  const identity = (root: string, worktree?: SessionWorktree): RepoIdentity => {
    const repoLabel = labelOf(root, path);
    return worktree
      ? { repoRoot: root, repoLabel, worktree }
      : { repoRoot: root, repoLabel };
  };
  if (!out) return identity(canonicalOrigin);

  const [gitDirRaw, commonDirRaw, toplevel] = out
    .split("\n")
    .map((l) => l.trim());
  if (!gitDirRaw || !commonDirRaw || !toplevel)
    return identity(canonicalOrigin);

  const gitDir = canonicalPath(joinGitDir(origin, gitDirRaw, path), path);
  const commonDir = canonicalPath(joinGitDir(origin, commonDirRaw, path), path);
  // A linked worktree's git-dir is `<main>/.git/worktrees/<name>`, so it differs from the common
  // dir; the main checkout's root is that common dir's parent. Bare-repo setups (common dir not
  // named `.git`) have no such parent — they fall back to their own toplevel and keep their own
  // folder, exactly as they did before this map resolved roots.
  const foldsToMain = path.basename(commonDir) === ".git";
  const repoRoot = canonicalPath(
    foldsToMain ? path.dirname(commonDir) : toplevel,
    path,
  );
  if (
    !repoRoot ||
    isFsRoot(repoRoot, path) ||
    repoRoot === canonicalPath(homeDir, path)
  )
    return identity(canonicalOrigin);

  const linked = foldsToMain && gitDir !== commonDir;
  return identity(
    repoRoot,
    linked
      ? {
          repoRoot,
          repoLabel: labelOf(repoRoot, path),
          name: path.basename(canonicalPath(toplevel, path)),
        }
      : undefined,
  );
}

export interface RepoIdentityMap {
  /** The identity of the directory a session STARTED in. Null only when no directory is known. */
  lookup(origin: string): RepoIdentity | null;
}

export interface RepoIdentityMapOptions extends RepoIdentityOptions {
  run?: RevParse;
}

/**
 * The origin → project-identity map the overview consults per session. Seeded from the durable
 * worktree store (so a deleted worktree's sessions keep merging), then filled by live git detection
 * — one spawn per unique origin directory per app run, positive AND negative results cached, which
 * is the same probe budget the worktree-only map spent.
 *
 * The input is the session's ORIGIN directory, never its live one: that's what freezes a session's
 * folder when the agent runs `cd` mid-task (caching is a performance detail, not the mechanism). A
 * side effect worth stating: a session that `cd`s out of its worktree no longer loses its badge.
 *
 * Only linked worktrees are written back to the store; a main-checkout root is cached for the run
 * only. If its directory is later deleted, resolution falls back to the origin — the same folder
 * path the session had before this map resolved roots.
 */
export function createRepoIdentityMap(
  store: WorktreeStore,
  {
    run = revParse,
    homeDir = homedir(),
    path = hostPath,
  }: RepoIdentityMapOptions = {},
): RepoIdentityMap {
  const cache = new Map<string, RepoIdentity>();
  try {
    for (const r of store.load()) {
      const repoRoot = canonicalPath(r.repoRoot, path);
      const repoLabel = labelOf(repoRoot, path);
      cache.set(canonicalPath(r.cwd, path), {
        repoRoot,
        repoLabel,
        worktree: { repoRoot, repoLabel, name: r.name },
      });
    }
  } catch {
    // An unreadable store must not cost the overview; live detection still works.
  }
  return {
    lookup(origin) {
      if (!origin) return null;
      const key = canonicalPath(origin, path);
      // A cached verdict (including a seeded row) is authoritative for the run and is NOT re-probed —
      // that's what lets a deleted worktree's sessions keep merging. The flip side (a worktree path
      // later reused for a different repo stays tagged to the old one until its row is removed) is an
      // accepted cost: worktree paths are ephemeral and near-unique. Don't "fix" this into a re-probe.
      const cached = cache.get(key);
      if (cached) return cached;
      const identity = parseRepoIdentity(origin, run(origin), {
        homeDir,
        path,
      });
      cache.set(key, identity);
      if (identity.worktree) {
        try {
          store.save({
            cwd: key,
            repoRoot: identity.repoRoot,
            name: identity.worktree.name,
          });
        } catch {
          // Persistence is best-effort; the in-memory cache still serves this run.
        }
      }
      return identity;
    },
  };
}
