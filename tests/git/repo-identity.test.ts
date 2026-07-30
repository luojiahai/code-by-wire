import { describe, it, expect, vi } from "vitest";
import { win32, posix } from "node:path";
import {
  parseRepoIdentity,
  createRepoIdentityMap,
  type WorktreeRow,
} from "../../src/main/git/repo-identity";

// Output of `git rev-parse --git-dir --git-common-dir --show-toplevel`: one value per line.
const out = (gitDir: string, commonDir: string, toplevel: string): string =>
  `${gitDir}\n${commonDir}\n${toplevel}\n`;

const HOME = "/Users/x";
const parse = (
  origin: string,
  raw: string | null,
): ReturnType<typeof parseRepoIdentity> =>
  parseRepoIdentity(origin, raw, { homeDir: HOME, path: posix });

describe("parseRepoIdentity", () => {
  it("folds a linked worktree into its main checkout, keeping the worktree descriptor", () => {
    expect(
      parse(
        "/w/repo-wt",
        out("/w/repo/.git/worktrees/repo-wt", "/w/repo/.git", "/w/repo-wt"),
      ),
    ).toEqual({
      repoRoot: "/w/repo",
      repoLabel: "repo",
      worktree: { repoRoot: "/w/repo", repoLabel: "repo", name: "repo-wt" },
    });
  });

  it("keeps the worktree's own name for a session started in its subdirectory", () => {
    expect(
      parse(
        "/w/repo-wt/packages/app",
        out("/w/repo/.git/worktrees/repo-wt", "/w/repo/.git", "/w/repo-wt"),
      ).worktree?.name,
    ).toBe("repo-wt");
  });

  it("gives a main checkout a repo root and no worktree descriptor", () => {
    expect(parse("/w/repo", out(".git", ".git", "/w/repo"))).toEqual({
      repoRoot: "/w/repo",
      repoLabel: "repo",
    });
  });

  it("resolves a subdirectory of a main checkout to the checkout's own root", () => {
    expect(
      parse("/w/repo/src/deep", out("/w/repo/.git", "/w/repo/.git", "/w/repo")),
    ).toEqual({ repoRoot: "/w/repo", repoLabel: "repo" });
  });

  it("resolves a bare-repo worktree to its toplevel with no worktree descriptor", () => {
    expect(
      parse(
        "/w/wt",
        out("/srv/repo.git/worktrees/wt", "/srv/repo.git", "/w/wt"),
      ),
    ).toEqual({ repoRoot: "/w/wt", repoLabel: "wt" });
  });

  it("falls back to the origin when the origin is not in a repository at all", () => {
    expect(parse("/Users/x/notes", null)).toEqual({
      repoRoot: "/Users/x/notes",
      repoLabel: "notes",
    });
    expect(parse("/Users/x/notes", "")).toEqual({
      repoRoot: "/Users/x/notes",
      repoLabel: "notes",
    });
    expect(parse("/Users/x/notes", "just-one-line\n")).toEqual({
      repoRoot: "/Users/x/notes",
      repoLabel: "notes",
    });
  });

  it("rejects a repo root equal to the home directory in favour of the origin", () => {
    expect(
      parse(
        "/Users/x/.config/app",
        out("/Users/x/.git", "/Users/x/.git", "/Users/x"),
      ),
    ).toEqual({ repoRoot: "/Users/x/.config/app", repoLabel: "app" });
  });

  it("rejects a repo root equal to a filesystem root in favour of the origin", () => {
    expect(parse("/srv/app", out("/.git", "/.git", "/"))).toEqual({
      repoRoot: "/srv/app",
      repoLabel: "app",
    });
  });

  it("drops the worktree descriptor when the guard rejects the folded root", () => {
    // A git init'd home with a linked worktree: the fold would swallow every session into one
    // folder, so the worktree keeps its own — and with it no badge, since nothing merged.
    expect(
      parse(
        "/Users/x/wt",
        out("/Users/x/.git/worktrees/wt", "/Users/x/.git", "/Users/x/wt"),
      ),
    ).toEqual({ repoRoot: "/Users/x/wt", repoLabel: "wt" });
  });

  it("strips a trailing separator from the origin and from the resolved root", () => {
    expect(parse("/Users/x/notes/", null).repoRoot).toBe("/Users/x/notes");
    expect(
      parse("/w/repo/src", out("/w/repo/.git/", "/w/repo/.git/", "/w/repo/"))
        .repoRoot,
    ).toBe("/w/repo");
  });

  it("returns the origin itself when it is a filesystem root", () => {
    expect(parse("/", null)).toEqual({ repoRoot: "/", repoLabel: "/" });
  });

  it("canonicalizes git's forward slashes to the platform separator on Windows", () => {
    expect(
      parseRepoIdentity(
        "C:\\w\\repo\\src",
        out("C:/w/repo/.git", "C:/w/repo/.git", "C:/w/repo"),
        { homeDir: "C:\\Users\\x", path: win32 },
      ),
    ).toEqual({ repoRoot: "C:\\w\\repo", repoLabel: "repo" });
  });

  it("canonicalizes a Windows origin with a trailing separator", () => {
    expect(
      parseRepoIdentity("C:\\w\\notes\\", null, {
        homeDir: "C:\\Users\\x",
        path: win32,
      }),
    ).toEqual({ repoRoot: "C:\\w\\notes", repoLabel: "notes" });
  });

  it("rejects a Windows drive root as a repo root", () => {
    expect(
      parseRepoIdentity("C:\\w\\app", out("C:/.git", "C:/.git", "C:/"), {
        homeDir: "C:\\Users\\x",
        path: win32,
      }),
    ).toEqual({ repoRoot: "C:\\w\\app", repoLabel: "app" });
  });

  it("rejects a home directory spelled with git's separators", () => {
    expect(
      parseRepoIdentity(
        "C:\\Users\\x\\notes",
        out("C:/Users/x/.git", "C:/Users/x/.git", "C:/Users/x"),
        { homeDir: "C:\\Users\\x", path: win32 },
      ),
    ).toEqual({ repoRoot: "C:\\Users\\x\\notes", repoLabel: "notes" });
  });
});

describe("createRepoIdentityMap", () => {
  const row: WorktreeRow = {
    cwd: "/w/repo-wt",
    repoRoot: "/w/repo",
    name: "repo-wt",
  };
  const deps = (
    over: Partial<Parameters<typeof createRepoIdentityMap>[1]>,
  ): Parameters<typeof createRepoIdentityMap>[1] => ({
    homeDir: HOME,
    path: posix,
    ...over,
  });

  it("serves persisted worktree rows without running git", () => {
    const run = vi.fn(() => null);
    const map = createRepoIdentityMap(
      { load: () => [row], save: () => {} },
      deps({ run }),
    );
    expect(map.lookup("/w/repo-wt")).toEqual({
      repoRoot: "/w/repo",
      repoLabel: "repo",
      worktree: { repoRoot: "/w/repo", repoLabel: "repo", name: "repo-wt" },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("probes an unseen origin once, persists the worktree, and caches the result", () => {
    const saved: WorktreeRow[] = [];
    let calls = 0;
    const map = createRepoIdentityMap(
      { load: () => [], save: (r) => saved.push(r) },
      deps({
        run: (cwd) => {
          calls++;
          return cwd === "/w/repo-wt"
            ? out(
                "/w/repo/.git/worktrees/repo-wt",
                "/w/repo/.git",
                "/w/repo-wt",
              )
            : null;
        },
      }),
    );
    expect(map.lookup("/w/repo-wt")?.repoRoot).toBe("/w/repo");
    expect(map.lookup("/w/repo-wt")?.repoRoot).toBe("/w/repo");
    expect(calls).toBe(1);
    expect(saved).toEqual([row]);
  });

  it("caches a main-checkout root without persisting it", () => {
    const saved: WorktreeRow[] = [];
    let calls = 0;
    const map = createRepoIdentityMap(
      { load: () => [], save: (r) => saved.push(r) },
      deps({
        run: () => {
          calls++;
          return out("/w/repo/.git", "/w/repo/.git", "/w/repo");
        },
      }),
    );
    expect(map.lookup("/w/repo/src")).toEqual({
      repoRoot: "/w/repo",
      repoLabel: "repo",
    });
    expect(map.lookup("/w/repo/src")?.repoRoot).toBe("/w/repo");
    expect(calls).toBe(1);
    expect(saved).toEqual([]);
  });

  it("caches a non-repository origin and does not persist it", () => {
    const saved: WorktreeRow[] = [];
    let calls = 0;
    const map = createRepoIdentityMap(
      { load: () => [], save: (r) => saved.push(r) },
      deps({
        run: () => {
          calls++;
          return null;
        },
      }),
    );
    expect(map.lookup("/w/plain")).toEqual({
      repoRoot: "/w/plain",
      repoLabel: "plain",
    });
    expect(map.lookup("/w/plain")?.repoRoot).toBe("/w/plain");
    expect(calls).toBe(1);
    expect(saved).toEqual([]);
  });

  it("probes once per unique origin, so two subdirectories of one repo probe twice", () => {
    let calls = 0;
    const map = createRepoIdentityMap(
      { load: () => [], save: () => {} },
      deps({
        run: () => {
          calls++;
          return out("/w/repo/.git", "/w/repo/.git", "/w/repo");
        },
      }),
    );
    expect(map.lookup("/w/repo/a")?.repoRoot).toBe("/w/repo");
    expect(map.lookup("/w/repo/b")?.repoRoot).toBe("/w/repo");
    expect(map.lookup("/w/repo/a")?.repoRoot).toBe("/w/repo");
    expect(calls).toBe(2);
  });

  it("returns null for an unknown origin", () => {
    const run = vi.fn(() => null);
    const map = createRepoIdentityMap(
      { load: () => [], save: () => {} },
      deps({ run }),
    );
    expect(map.lookup("")).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("survives a throwing store on both load and save", () => {
    const map = createRepoIdentityMap(
      {
        load: () => {
          throw new Error("no table");
        },
        save: () => {
          throw new Error("disk full");
        },
      },
      deps({
        run: () =>
          out("/w/repo/.git/worktrees/repo-wt", "/w/repo/.git", "/w/repo-wt"),
      }),
    );
    expect(map.lookup("/w/repo-wt")?.repoLabel).toBe("repo");
  });
});
