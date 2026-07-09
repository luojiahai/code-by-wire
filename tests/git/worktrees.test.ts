import { describe, it, expect, vi } from "vitest";
import {
  parseWorktree,
  createWorktreeMap,
  type WorktreeRow,
} from "../../src/main/git/worktrees";

// Output of `git rev-parse --git-dir --git-common-dir --show-toplevel`: one value per line.
const out = (gitDir: string, commonDir: string, toplevel: string): string =>
  `${gitDir}\n${commonDir}\n${toplevel}\n`;

describe("parseWorktree", () => {
  it("maps a linked worktree to its main checkout", () => {
    expect(
      parseWorktree(
        "/w/repo-wt",
        out("/w/repo/.git/worktrees/repo-wt", "/w/repo/.git", "/w/repo-wt"),
      ),
    ).toEqual({ repoRoot: "/w/repo", repoLabel: "repo", name: "repo-wt" });
  });

  it("maps a subdirectory of a linked worktree, keeping the worktree's own name", () => {
    expect(
      parseWorktree(
        "/w/repo-wt/packages/app",
        out("/w/repo/.git/worktrees/repo-wt", "/w/repo/.git", "/w/repo-wt"),
      ),
    ).toEqual({ repoRoot: "/w/repo", repoLabel: "repo", name: "repo-wt" });
  });

  it("returns null for the main checkout root (relative .git from rev-parse)", () => {
    expect(parseWorktree("/w/repo", out(".git", ".git", "/w/repo"))).toBeNull();
  });

  it("returns null for a subdirectory of the main checkout", () => {
    expect(
      parseWorktree(
        "/w/repo/src",
        out("/w/repo/.git", "/w/repo/.git", "/w/repo"),
      ),
    ).toBeNull();
  });

  it("returns null for a bare-repo worktree (common dir not named .git)", () => {
    expect(
      parseWorktree(
        "/w/wt",
        out("/srv/repo.git/worktrees/wt", "/srv/repo.git", "/w/wt"),
      ),
    ).toBeNull();
  });

  it("returns null on failed rev-parse or malformed output", () => {
    expect(parseWorktree("/w/x", null)).toBeNull();
    expect(parseWorktree("/w/x", "")).toBeNull();
    expect(parseWorktree("/w/x", "just-one-line\n")).toBeNull();
  });
});

describe("createWorktreeMap", () => {
  const row: WorktreeRow = {
    cwd: "/w/repo-wt",
    repoRoot: "/w/repo",
    name: "repo-wt",
  };

  it("serves persisted rows without running git", () => {
    const run = vi.fn(() => null);
    const map = createWorktreeMap({ load: () => [row], save: () => {} }, run);
    expect(map.lookup("/w/repo-wt")).toEqual({
      repoRoot: "/w/repo",
      repoLabel: "repo",
      name: "repo-wt",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("detects an unseen cwd once, persists it, and caches the result", () => {
    const saved: WorktreeRow[] = [];
    let calls = 0;
    const map = createWorktreeMap(
      { load: () => [], save: (r) => saved.push(r) },
      (cwd) => {
        calls++;
        return cwd === "/w/repo-wt"
          ? out("/w/repo/.git/worktrees/repo-wt", "/w/repo/.git", "/w/repo-wt")
          : null;
      },
    );
    expect(map.lookup("/w/repo-wt")?.repoRoot).toBe("/w/repo");
    expect(map.lookup("/w/repo-wt")?.repoRoot).toBe("/w/repo");
    expect(calls).toBe(1);
    expect(saved).toEqual([row]);
  });

  it("caches negative results and does not persist them", () => {
    const saved: WorktreeRow[] = [];
    let calls = 0;
    const map = createWorktreeMap(
      { load: () => [], save: (r) => saved.push(r) },
      () => {
        calls++;
        return null;
      },
    );
    expect(map.lookup("/w/plain")).toBeNull();
    expect(map.lookup("/w/plain")).toBeNull();
    expect(calls).toBe(1);
    expect(saved).toEqual([]);
  });

  it("survives a throwing store on both load and save", () => {
    const map = createWorktreeMap(
      {
        load: () => {
          throw new Error("no table");
        },
        save: () => {
          throw new Error("disk full");
        },
      },
      () => out("/w/repo/.git/worktrees/repo-wt", "/w/repo/.git", "/w/repo-wt"),
    );
    expect(map.lookup("/w/repo-wt")?.repoLabel).toBe("repo");
  });
});
