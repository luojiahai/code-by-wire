import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  readGit,
  _flushGitReads,
  _resetGitCache,
} from "../../src/main/git/read-git";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-git-");

beforeEach(() => {
  _resetGitCache();
});

// Drain in-flight refreshes before tempHomes' rmSync: a test that kicks a refresh and never flushes
// leaves a git.exe running with its cwd inside the temp dir, and Windows refuses to delete a
// directory a live process holds (EPERM in CI). Registered AFTER tempHomes(), so vitest's stack
// ordering of after-hooks runs this flush first, then the cleanup.
afterEach(async () => {
  await _flushGitReads();
});

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

/** readGit is non-blocking (readPr-style): a stale entry serves the last glance and refreshes in
 *  the background. This drives one poll + settle + poll — the value the NEXT tick would see. */
async function settledRead(dir: string): Promise<ReturnType<typeof readGit>> {
  readGit(dir);
  await _flushGitReads();
  return readGit(dir);
}

describe("readGit", () => {
  it("returns null immediately on first sight — the refresh lands on a later poll", () => {
    expect(readGit(initRepo())).toBeNull();
  });

  it("returns null outside a repo, before and after the probe settles", async () => {
    const dir = makeHome();
    expect(await settledRead(dir)).toBeNull();
  });

  it("reports the branch and a null remote on a fresh repo", async () => {
    const dir = initRepo();
    expect(await settledRead(dir)).toEqual({ branch: "main", remoteUrl: null });
  });

  it("falls back to a null branch on detached HEAD", async () => {
    const dir = initRepo();
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
    git(dir, "checkout", "-q", "--detach", sha);
    expect((await settledRead(dir))!.branch).toBeNull();
  });

  it("follows a checkout on the next poll (HEAD mtime moves the token)", async () => {
    const dir = initRepo();
    expect((await settledRead(dir))!.branch).toBe("main");
    git(dir, "checkout", "-q", "-b", "feature");
    // The first post-checkout poll serves the stale glance while refreshing off-thread…
    expect(readGit(dir)!.branch).toBe("main");
    await _flushGitReads();
    // …and the next poll has the new branch.
    expect(readGit(dir)!.branch).toBe("feature");
  });

  it("serves a cached glance within the TTL when HEAD is unmoved", async () => {
    const dir = initRepo();
    expect((await settledRead(dir))!.remoteUrl).toBeNull();
    git(dir, "remote", "add", "origin", "git@github.com:o/r.git"); // doesn't touch .git/HEAD
    expect(readGit(dir)!.remoteUrl).toBeNull(); // cached: HEAD mtime unchanged, within the 5s TTL
    await _flushGitReads();
    expect(readGit(dir)!.remoteUrl).toBeNull(); // and no background refresh was kicked either
  });

  it("normalizes the origin remote to a browsable https url", async () => {
    const dir = initRepo();
    git(
      dir,
      "remote",
      "add",
      "origin",
      "git@github.com:luojiahai/code-by-wire.git",
    );
    expect((await settledRead(dir))!.remoteUrl).toBe(
      "https://github.com/luojiahai/code-by-wire",
    );
  });

  it("reports a null remote when there is no origin", async () => {
    expect((await settledRead(initRepo()))!.remoteUrl).toBeNull();
  });
});
