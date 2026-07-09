import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";
import type { SessionWorktree } from "@shared/types";
import { joinGitDir } from "./read-git";

/** One durable cwd → main-checkout mapping row, the shape the analytics store persists. Recorded
 *  while the worktree directory still exists so its sessions keep merging after it's deleted. */
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
 * Parse rev-parse output into the cwd's worktree identity, or null when it isn't inside a linked
 * worktree. Linked iff the resolved git-dir differs from the resolved common dir (a linked
 * worktree's git-dir is `<main>/.git/worktrees/<name>`). The main checkout's root is the common
 * dir's parent — only when the common dir is actually named `.git`; bare-repo setups fall out as
 * null and keep today's per-cwd folder. The worktree's name is the basename of its toplevel, so a
 * session in a worktree subdirectory still reports the worktree's own name.
 */
export function parseWorktree(
  cwd: string,
  out: string | null,
): SessionWorktree | null {
  if (!out) return null;
  const [gitDirRaw, commonDirRaw, toplevel] = out
    .split("\n")
    .map((l) => l.trim());
  if (!gitDirRaw || !commonDirRaw || !toplevel) return null;
  const gitDir = joinGitDir(cwd, gitDirRaw);
  const commonDir = joinGitDir(cwd, commonDirRaw);
  if (gitDir === commonDir) return null;
  if (basename(commonDir) !== ".git") return null;
  const repoRoot = dirname(commonDir);
  return { repoRoot, repoLabel: basename(repoRoot), name: basename(toplevel) };
}

export interface WorktreeMap {
  lookup(cwd: string): SessionWorktree | null;
}

/**
 * The cwd → worktree-identity map the overview consults per session. Seeded from the durable store
 * (so a deleted worktree's cwd still resolves), then filled by live git detection — one spawn per
 * unique cwd per app run, positive AND negative results cached. Positives are written back to the
 * store; negatives aren't persisted (cheap to re-probe next run).
 */
export function createWorktreeMap(
  store: WorktreeStore,
  run: RevParse = revParse,
): WorktreeMap {
  const cache = new Map<string, SessionWorktree | null>();
  try {
    for (const r of store.load())
      cache.set(r.cwd, {
        repoRoot: r.repoRoot,
        repoLabel: basename(r.repoRoot),
        name: r.name,
      });
  } catch {
    // An unreadable store must not cost the overview; live detection still works.
  }
  return {
    lookup(cwd) {
      // A cached verdict (including a seeded row) is authoritative for the run and is NOT re-probed —
      // that's what lets a deleted worktree's sessions keep merging. The flip side (a worktree path
      // later reused for a different repo stays tagged to the old one until its row is removed) is an
      // accepted cost: worktree paths are ephemeral and near-unique. Don't "fix" this into a re-probe.
      if (cache.has(cwd)) return cache.get(cwd) ?? null;
      const wt = parseWorktree(cwd, run(cwd));
      cache.set(cwd, wt);
      if (wt) {
        try {
          store.save({ cwd, repoRoot: wt.repoRoot, name: wt.name });
        } catch {
          // Persistence is best-effort; the in-memory cache still serves this run.
        }
      }
      return wt;
    },
  };
}
