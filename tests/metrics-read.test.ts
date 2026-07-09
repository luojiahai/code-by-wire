import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createClaudeProvider } from "../src/main/provider/claude";
import { _setPrRunner, _resetPrCache } from "../src/main/git/read-pr";
import { tempHomes } from "./helpers/temp-home";

const makeHome = tempHomes("cbw-metrics-");

beforeEach(() => {
  _resetPrCache();
  _setPrRunner(() => Promise.resolve(null)); // never spawn gh in tests
});

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
}

function initRepo(branch: string): string {
  const repo = makeHome();
  git(repo, "init", "-q", "-b", branch);
  git(repo, "config", "user.email", "t@t.t");
  git(repo, "config", "user.name", "T");
  writeFileSync(join(repo, "a.txt"), "x\n");
  git(repo, "add", "a.txt");
  git(repo, "commit", "-qm", "init");
  return repo;
}

function writeTranscript(
  claudeDir: string,
  proj: string,
  id: string,
  rows: unknown[],
): void {
  const projDir = join(claudeDir, "projects", proj);
  mkdirSync(projDir, { recursive: true });
  writeFileSync(
    join(projDir, `${id}.jsonl`),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
}

const turn = (id: string, cwd: string | undefined) => [
  {
    type: "user",
    sessionId: id,
    cwd,
    timestamp: "2026-06-11T00:00:00.000Z",
    message: { content: "hi" },
  },
  {
    type: "assistant",
    sessionId: id,
    cwd,
    timestamp: "2026-06-11T00:00:10.000Z",
    message: { id: "m1", usage: { input_tokens: 10, output_tokens: 50 } },
  },
];

function scaffold(): { claudeDir: string; id: string; repo: string } {
  const claudeDir = makeHome();
  const repo = makeHome();
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@t.t");
  git(repo, "config", "user.name", "T");
  writeFileSync(join(repo, "a.txt"), "x\n");
  git(repo, "add", "a.txt");
  git(repo, "commit", "-qm", "init");

  const id = "sess-1";
  const projDir = join(claudeDir, "projects", "proj");
  mkdirSync(projDir, { recursive: true });
  const rows = [
    {
      type: "user",
      sessionId: id,
      cwd: repo,
      timestamp: "2026-06-11T00:00:00.000Z",
      message: { content: "hi" },
    },
    {
      type: "assistant",
      sessionId: id,
      cwd: repo,
      timestamp: "2026-06-11T00:00:10.000Z",
      message: {
        id: "m1",
        model: "claude-opus-4-8",
        usage: { input_tokens: 200, output_tokens: 1000 },
      },
    },
  ];
  writeFileSync(
    join(projDir, `${id}.jsonl`),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  return { claudeDir, id, repo };
}

describe("provider.readMetrics", () => {
  it("returns token speed and git for the session, with a change token", () => {
    const { claudeDir, id } = scaffold();
    const provider = createClaudeProvider({ claudeDir });
    const r = provider.readMetrics(id);
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.metrics.tokenSpeed?.outputTps).toBeCloseTo(100, 5);
    expect(r.metrics.git?.branch).toBe("main");
    expect(typeof r.mtimeMs).toBe("number");
  });

  it("only asks gh for a PR when the glance found a browsable remote", () => {
    let calls = 0;
    _setPrRunner(() => {
      calls++;
      return Promise.resolve(null);
    });

    // No origin: a remote-less repo can't have a PR, so gh is never spawned.
    const bare = scaffold();
    createClaudeProvider({ claudeDir: bare.claudeDir }).readMetrics(bare.id);
    expect(calls).toBe(0);

    // With an origin the glance carries a browsable remoteUrl, so the PR lookup fires.
    const withRemote = scaffold();
    git(withRemote.repo, "remote", "add", "origin", "git@github.com:o/r.git");
    createClaudeProvider({
      claudeDir: withRemote.claudeDir,
    }).readMetrics(withRemote.id);
    expect(calls).toBe(1);
  });

  it("skips the recompute when the change token is unchanged", () => {
    const { claudeDir, id } = scaffold();
    const provider = createClaudeProvider({ claudeDir });
    const first = provider.readMetrics(id);
    if (first.status !== "changed") throw new Error("expected changed");
    expect(provider.readMetrics(id, first.mtimeMs).status).toBe("unchanged");
  });

  it("is absent for an unknown session", () => {
    const { claudeDir } = scaffold();
    expect(createClaudeProvider({ claudeDir }).readMetrics("nope").status).toBe(
      "absent",
    );
  });

  it("re-reads when the remote-control manifest changes though the transcript did not", () => {
    const { claudeDir, id } = scaffold();
    const provider = createClaudeProvider({ claudeDir });
    const first = provider.readMetrics(id);
    if (first.status !== "changed") throw new Error("expected changed");
    expect(first.metrics.remoteControl).toBeNull();

    // Attach a remote bridge: a new manifest naming this session. No transcript or git change.
    const sessions = join(claudeDir, "sessions");
    mkdirSync(sessions, { recursive: true });
    writeFileSync(
      join(sessions, "999.json"),
      JSON.stringify({ sessionId: id, bridgeSessionId: "bridge-1" }),
    );

    const second = provider.readMetrics(id, first.mtimeMs);
    expect(second.status).toBe("changed"); // token folds in remote state, so the renderer refetches
    if (second.status !== "changed") return;
    expect(second.metrics.remoteControl).toBe(true);
  });

  it("resolves git once a cwd-less transcript gains a cwd, instead of pinning null forever", () => {
    const claudeDir = makeHome();
    const repo = initRepo("main");
    const id = "sess-nocwd";
    writeTranscript(claudeDir, "proj", id, [
      {
        type: "user",
        sessionId: id,
        timestamp: "2026-06-11T00:00:00.000Z",
        message: { content: "hi" },
      },
    ]);
    const provider = createClaudeProvider({ claudeDir });
    const first = provider.readMetrics(id);
    if (first.status !== "changed") throw new Error("expected changed");
    expect(first.metrics.git).toBeNull(); // no cwd yet → no git

    writeTranscript(claudeDir, "proj", id, turn(id, repo)); // a later row supplies the cwd
    const second = provider.readMetrics(id);
    expect(second.status).toBe("changed");
    if (second.status !== "changed") return;
    expect(second.metrics.git?.branch).toBe("main"); // re-resolved, not pinned to the cwd-less first read
  });

  it("re-resolves cwd after readTranscript invalidates a moved transcript (shared path cache)", () => {
    const claudeDir = makeHome();
    const repoA = initRepo("main");
    const repoB = initRepo("develop");
    const id = "sess-move";
    writeTranscript(claudeDir, "projA", id, turn(id, repoA));
    const provider = createClaudeProvider({ claudeDir });
    const before = provider.readMetrics(id); // caches pathById=projA, cwdById=repoA
    if (before.status === "changed")
      expect(before.metrics.git?.branch).toBe("main");

    // The transcript moves to a new project dir scoped to a different repo (resume elsewhere).
    rmSync(join(claudeDir, "projects", "projA", `${id}.jsonl`));
    writeTranscript(claudeDir, "projB", id, turn(id, repoB));
    provider.readTranscript(id); // the transcript poll runs first and refreshes the shared path cache

    const after = provider.readMetrics(id);
    expect(after.status).toBe("changed");
    if (after.status !== "changed") return;
    expect(after.metrics.git?.branch).toBe("develop"); // re-resolved to the new cwd, not the stale repoA
  });

  it("reuses the cached token speed when only git moves, not the transcript", () => {
    const { claudeDir, id, repo } = scaffold();
    const projFile = join(claudeDir, "projects", "proj", `${id}.jsonl`);
    const FIXED = new Date("2026-06-11T12:00:00.000Z");
    utimesSync(projFile, FIXED, FIXED);

    const provider = createClaudeProvider({ claudeDir });
    const first = provider.readMetrics(id);
    if (first.status !== "changed") throw new Error("expected changed");
    expect(first.metrics.tokenSpeed?.outputTps).toBeCloseTo(100, 5); // 1000 / 10s

    // Rewrite the transcript with very different usage, but restore the mtime so the speed cache key (the
    // file mtime) is unchanged. A re-parse would read 9999 t/s; the mtime-keyed cache must not.
    const rows = turn(id, repo);
    rows[1] = {
      ...rows[1],
      message: { id: "m9", usage: { input_tokens: 0, output_tokens: 9999 } },
    };
    writeFileSync(
      projFile,
      rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
    utimesSync(projFile, FIXED, FIXED);

    // Stage a file: .git/index mtime moves, so the git portion of the token moves and forces a rebuild.
    writeFileSync(join(repo, "b.txt"), "hello\n");
    git(repo, "add", "b.txt");

    const second = provider.readMetrics(id, first.mtimeMs);
    expect(second.status).toBe("changed"); // git moved → token moved
    if (second.status !== "changed") return;
    expect(second.metrics.tokenSpeed?.outputTps).toBeCloseTo(100, 5); // cached by mtime, not reparsed to 999.9
  });

  it("token speed includes subagent transcript turns", () => {
    const claudeDir = makeHome();
    writeTranscript(
      claudeDir,
      "-proj",
      "sess-sub",
      turn("sess-sub", undefined),
    );
    const subDir = join(
      claudeDir,
      "projects",
      "-proj",
      "sess-sub",
      "subagents",
    );
    mkdirSync(subDir, { recursive: true });
    writeFileSync(
      join(subDir, "agent-x.jsonl"),
      [
        {
          type: "user",
          timestamp: "2026-06-11T00:00:00.000Z",
          message: { content: "task" },
        },
        {
          type: "assistant",
          timestamp: "2026-06-11T00:00:10.000Z",
          message: {
            id: "sub-m1",
            usage: { input_tokens: 0, output_tokens: 500 },
          },
        },
      ]
        .map((r) => JSON.stringify(r))
        .join("\n") + "\n",
    );
    const p = createClaudeProvider({ claudeDir });
    const read = p.readMetrics("sess-sub", 0);
    expect(read.status).toBe("changed");
    if (read.status !== "changed") return;
    // main turn: 50 output; subagent: 500 — both over the merged 0→10s interval.
    expect(read.metrics.tokenSpeed?.outputTps).toBeCloseTo(55, 5);
  });

  it("recomputes when only a subagent transcript moves (token folds subagent mtimes)", () => {
    const claudeDir = makeHome();
    writeTranscript(claudeDir, "-proj", "sess-mt", turn("sess-mt", undefined));
    const subDir = join(claudeDir, "projects", "-proj", "sess-mt", "subagents");
    mkdirSync(subDir, { recursive: true });
    const subPath = join(subDir, "agent-x.jsonl");
    writeFileSync(
      subPath,
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-06-11T00:00:10.000Z",
        message: {
          id: "sub-m1",
          usage: { input_tokens: 0, output_tokens: 500 },
        },
      }) + "\n",
    );
    const p = createClaudeProvider({ claudeDir });
    const first = p.readMetrics("sess-mt", 0);
    expect(first.status).toBe("changed");
    if (first.status !== "changed") return;
    expect(p.readMetrics("sess-mt", first.mtimeMs).status).toBe("unchanged");

    // Append a bigger final snapshot for the same id and move ONLY the subagent file's mtime forward.
    appendFileSync(
      subPath,
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-06-11T00:00:20.000Z",
        message: {
          id: "sub-m1",
          usage: { input_tokens: 0, output_tokens: 900 },
        },
      }) + "\n",
    );
    const later = Date.now() + 5_000;
    utimesSync(subPath, new Date(later), new Date(later));

    const second = p.readMetrics("sess-mt", first.mtimeMs);
    expect(second.status).toBe("changed");
    if (second.status !== "changed") return;
    // sub-m1's interval extends to its last snapshot: [10s, 20s] with output 900. Merged with the
    // main turn's [0s, 10s] that is 20s of active time; (50 + 900) / 20 = 47.5.
    expect(second.metrics.tokenSpeed?.outputTps).toBeCloseTo(47.5, 5);
  });
});
