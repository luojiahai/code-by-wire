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

describe("readGit", () => {
  it("returns null outside a repo", () => {
    expect(readGit(makeHome())).toBeNull();
  });

  it("reports the branch and a null remote on a fresh repo", () => {
    const dir = initRepo();
    expect(readGit(dir)).toEqual({ branch: "main", remoteUrl: null });
  });

  it("falls back to a null branch on detached HEAD", () => {
    const dir = initRepo();
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
    git(dir, "checkout", "-q", "--detach", sha);
    expect(readGit(dir)!.branch).toBeNull();
  });

  it("reflects a checkout immediately (HEAD mtime moves the token)", () => {
    const dir = initRepo();
    expect(readGit(dir)!.branch).toBe("main");
    git(dir, "checkout", "-q", "-b", "feature");
    expect(readGit(dir)!.branch).toBe("feature");
  });

  it("serves a cached glance within the TTL when HEAD is unmoved", () => {
    const dir = initRepo();
    expect(readGit(dir)!.remoteUrl).toBeNull();
    git(dir, "remote", "add", "origin", "git@github.com:o/r.git"); // doesn't touch .git/HEAD
    expect(readGit(dir)!.remoteUrl).toBeNull(); // cached: HEAD mtime unchanged, within the 5s TTL
  });

  it("normalizes the origin remote to a browsable https url", () => {
    const dir = initRepo();
    git(
      dir,
      "remote",
      "add",
      "origin",
      "git@github.com:luojiahai/code-by-wire.git",
    );
    expect(readGit(dir)!.remoteUrl).toBe(
      "https://github.com/luojiahai/code-by-wire",
    );
  });

  it("reports a null remote when there is no origin", () => {
    expect(readGit(initRepo())!.remoteUrl).toBeNull();
  });
});
