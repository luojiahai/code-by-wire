import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readGit } from "../../src/main/git/read-git";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-git-");

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
}

function initRepo(): string {
  const dir = makeHome();
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "T");
  writeFileSync(join(dir, "a.txt"), "one\n");
  git(dir, "add", "a.txt");
  git(dir, "commit", "-qm", "init");
  return dir;
}

describe.skipIf(process.platform === "win32")("readGit", () => {
  it("returns null outside a repo", () => {
    expect(readGit(makeHome())).toBeNull();
  });

  it("reports branch, clean status, and a short sha on a fresh repo", () => {
    const dir = initRepo();
    const g = readGit(dir)!;
    expect(g.branch).toBe("main");
    expect(g.dirty).toBe(false);
    expect(g.insertions).toBe(0);
    expect(g.deletions).toBe(0);
    expect(g.sha).toMatch(/^[0-9a-f]{7,}$/);
    expect(g.ahead).toBeNull(); // no upstream
    expect(g.behind).toBeNull();
  });

  it("counts working-tree insertions/deletions and flips to dirty", () => {
    const dir = initRepo();
    writeFileSync(join(dir, "a.txt"), "one\ntwo\nthree\n"); // +2 lines
    const g = readGit(dir)!;
    expect(g.dirty).toBe(true);
    expect(g.insertions).toBe(2);
    expect(g.deletions).toBe(0);
  });

  it("serves a cached glance within the TTL after an unstaged edit (HEAD/index unmoved)", () => {
    const dir = initRepo();
    expect(readGit(dir)!.dirty).toBe(false);
    writeFileSync(join(dir, "a.txt"), "one\ntwo\n"); // unstaged edit; doesn't touch .git/HEAD or .git/index
    expect(readGit(dir)!.dirty).toBe(false); // cached: HEAD/index mtime unchanged, within the 5s TTL
  });
});
