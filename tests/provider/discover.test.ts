import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  listCandidates,
  summarize,
  restate,
  readSessionFiles,
} from "../../src/main/provider/claude/discover";
import type { SessionCandidate } from "@shared/types";
import { tempHomes } from "../helpers/temp-home";

const CLAUDE_DIR = resolve("tests/fixtures/claude-home");

const makeHome = tempHomes("cbw-");

function writeSessionFile(home: string, raw: Record<string, unknown>): void {
  mkdirSync(join(home, "sessions"), { recursive: true });
  writeFileSync(
    join(home, "sessions", `${String(raw.pid)}.json`),
    JSON.stringify(raw),
  );
}
function writeTranscript(
  home: string,
  proj: string,
  id: string,
  body: string,
  mtimeSec: number,
): string {
  const dir = join(home, "projects", proj);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  writeFileSync(path, body);
  utimesSync(path, new Date(mtimeSec * 1000), new Date(mtimeSec * 1000));
  return path;
}

// A candidate pointing at a real fixture transcript; cwd '' so the transcript's own cwd lines win.
function fixtureCandidate(
  id: string,
  proj: string,
  over: Partial<SessionCandidate> = {},
): SessionCandidate {
  return {
    id,
    alive: true,
    status: "busy",
    cwd: "",
    transcriptPath: resolve(CLAUDE_DIR, "projects", proj, `${id}.jsonl`),
    transcriptMtimeMs: 1,
    ...over,
  };
}

describe("summarize", () => {
  it("parses a live session transcript into a working snapshot", () => {
    const s = summarize(
      fixtureCandidate(
        "aaaa1111-1111-1111-1111-111111111111",
        "-work-code-by-wire",
      ),
    );
    expect(s.title).toBe("Add a login form to the settings page");
    expect(s.project).toBe("code-by-wire");
    expect(s.branch).toBe("feature/login");
    expect(s.model).toBe("sonnet");
    expect(s.management).toBe("observed");
    expect(s.state).toBe("working"); // alive + status busy
    expect(s.lastActivityMs).toBe(Date.parse("2026-06-08T22:54:06.078Z"));
    expect(s.awaitingUser).toBe(false);
    expect(s.transcriptMtimeMs).toBe(1);
    expect(s.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheCreationTokens: 5,
      cacheCreation5mTokens: 5,
      cacheCreation1hTokens: 0,
    });
    expect(s.contextTokens).toBe(115); // input (100) + cache-read (10) + cache-creation (5)
  });

  it("derives ended when the candidate process is gone", () => {
    const s = summarize(
      fixtureCandidate(
        "aaaa1111-1111-1111-1111-111111111111",
        "-work-code-by-wire",
        { alive: false },
      ),
    );
    expect(s.state).toBe("ended");
  });

  it("derives waiting when the transcript tail is blocked on a prompt", () => {
    const s = summarize(
      fixtureCandidate(
        "dddd4444-4444-4444-4444-444444444444",
        "-work-checkout",
        { status: "idle" },
      ),
    );
    expect(s.state).toBe("waiting");
  });

  it("falls back to a registry skeleton when there is no transcript", () => {
    const s = summarize({
      id: "b",
      alive: true,
      status: "idle",
      cwd: "/work/old-thing",
      transcriptPath: undefined,
      transcriptMtimeMs: 0,
      updatedAt: 1780950000000,
    });
    expect(s.title).toBe("old-thing");
    expect(s.project).toBe("old-thing");
    expect(s.branch).toBeUndefined();
    expect(s.lastActivityMs).toBe(1780950000000);
    expect(s.state).toBe("idle");
    expect(s.transcriptMtimeMs).toBe(0);
  });

  it("falls back to skeleton when the transcript path cannot be read (a directory → EISDIR)", () => {
    const home = makeHome();
    mkdirSync(join(home, "projects", "-work-widget", "sess-1.jsonl"), {
      recursive: true,
    });
    const s = summarize({
      id: "sess-1",
      alive: true,
      status: "idle",
      cwd: "/work/widget",
      transcriptPath: join(home, "projects", "-work-widget", "sess-1.jsonl"),
      transcriptMtimeMs: 7,
      updatedAt: 123,
    });
    expect(s.title).toBe("widget"); // basename(cwd) fallback, not a thrown error
    expect(s.lastActivityMs).toBe(123);
  });

  it('falls back to "unknown" for a root cwd with no transcript', () => {
    const s = summarize({
      id: "r",
      alive: true,
      status: undefined,
      cwd: "/",
      transcriptPath: undefined,
      transcriptMtimeMs: 0,
      updatedAt: 1,
    });
    expect(s.title).toBe("unknown");
    expect(s.project).toBe("unknown");
  });

  it("falls back to the registry updatedAt for createdMs when there is no transcript", () => {
    const snap = summarize({
      id: "x",
      alive: false,
      cwd: "/w/app",
      transcriptMtimeMs: 0,
      updatedAt: 1780950000000,
    });
    expect(snap.createdMs).toBe(1780950000000);
  });
});

describe("restate", () => {
  it("refreshes only state from fresh liveness, preserving the parsed fields", () => {
    const prev = summarize(
      fixtureCandidate(
        "aaaa1111-1111-1111-1111-111111111111",
        "-work-code-by-wire",
      ),
    );
    expect(prev.state).toBe("working");
    const dead = {
      ...fixtureCandidate(
        "aaaa1111-1111-1111-1111-111111111111",
        "-work-code-by-wire",
      ),
      alive: false,
    };
    const next = restate(dead, prev);
    expect(next.state).toBe("ended");
    expect(next.title).toBe(prev.title);
    expect(next.transcriptMtimeMs).toBe(prev.transcriptMtimeMs);
  });
});

describe("listCandidates", () => {
  const NOW = 10_000_000_000; // fixed clock (ms)
  const WINDOW = 60_000; // 60s recency window

  it("unions live registry sessions with recent transcripts, keyed by id", () => {
    const home = makeHome();
    writeSessionFile(home, {
      pid: 100,
      sessionId: "live",
      cwd: "/w/live",
      status: "busy",
      updatedAt: 1,
    });
    writeTranscript(
      home,
      "-w-ended",
      "ended",
      '{"type":"user","message":{"content":"hi"}}\n',
      NOW / 1000 - 1,
    ); // 1s ago
    const cands = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    });
    const byId = Object.fromEntries(cands.map((c) => [c.id, c]));
    expect(Object.keys(byId).sort()).toEqual(["ended", "live"]);
    expect(byId["live"].alive).toBe(true);
    expect(byId["live"].transcriptPath).toBeUndefined(); // registry-only, no transcript
    expect(byId["ended"].alive).toBe(false); // transcript only, no registry → not alive → Ended
    expect(byId["ended"].transcriptPath).toBeDefined();
  });

  it("drops a transcript-only session older than the recency window", () => {
    const home = makeHome();
    writeTranscript(
      home,
      "-w-old",
      "ancient",
      '{"type":"user","message":{"content":"hi"}}\n',
      NOW / 1000 - 1000,
    ); // 1000s ago
    const cands = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    });
    expect(cands.map((c) => c.id)).not.toContain("ancient");
  });

  it("keeps a live registry session even when its transcript is old", () => {
    const home = makeHome();
    writeSessionFile(home, {
      pid: 7,
      sessionId: "oldlive",
      cwd: "/w/oldlive",
      status: "idle",
      updatedAt: 1,
    });
    writeTranscript(
      home,
      "-w-oldlive",
      "oldlive",
      '{"type":"user","message":{"content":"hi"}}\n',
      NOW / 1000 - 5000,
    );
    const c = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    }).find((x) => x.id === "oldlive")!;
    expect(c).toBeDefined();
    expect(c.alive).toBe(true);
    expect(c.transcriptPath).toBeDefined();
  });

  it("marks a registry session with a dead pid as not alive", () => {
    const home = makeHome();
    writeSessionFile(home, {
      pid: 999,
      sessionId: "dead",
      cwd: "/w/dead",
      status: "idle",
      updatedAt: 1,
    });
    const [c] = listCandidates({
      claudeDir: home,
      isPidAlive: () => false,
      now: NOW,
      recentWindowMs: WINDOW,
    });
    expect(c.alive).toBe(false);
  });

  it("drops a live background (kind:'bg') session", () => {
    const home = makeHome();
    writeSessionFile(home, {
      pid: 100,
      sessionId: "bgsess",
      cwd: "/w/bg",
      status: "idle",
      kind: "bg",
      jobId: "bgsess",
      updatedAt: 1,
    });
    const ids = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    }).map((c) => c.id);
    expect(ids).not.toContain("bgsess");
  });

  it("drops a session with a jobId but no kind field", () => {
    const home = makeHome();
    writeSessionFile(home, {
      pid: 104,
      sessionId: "jobonly",
      cwd: "/w/job",
      status: "idle",
      jobId: "jobonly",
      updatedAt: 1,
    });
    const ids = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    }).map((c) => c.id);
    expect(ids).not.toContain("jobonly");
  });

  it("keeps an interactive session and a session with no kind field", () => {
    const home = makeHome();
    writeSessionFile(home, {
      pid: 101,
      sessionId: "inter",
      cwd: "/w/i",
      status: "busy",
      kind: "interactive",
      updatedAt: 1,
    });
    writeSessionFile(home, {
      pid: 102,
      sessionId: "nokind",
      cwd: "/w/n",
      status: "idle",
      updatedAt: 1,
    });
    const ids = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    }).map((c) => c.id);
    expect(ids).toContain("inter");
    expect(ids).toContain("nokind");
  });

  it("keeps a transcript-only session alongside a dropped bg sibling", () => {
    const home = makeHome();
    writeSessionFile(home, {
      pid: 103,
      sessionId: "bgsib",
      cwd: "/w/bg",
      status: "idle",
      kind: "bg",
      jobId: "bgsib",
      updatedAt: 1,
    });
    writeTranscript(
      home,
      "-w-ended",
      "endedsess",
      '{"type":"user","message":{"content":"hi"}}\n',
      NOW / 1000 - 1,
    ); // 1s ago, inside the window
    const ids = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    }).map((c) => c.id);
    expect(ids).toContain("endedsess");
    expect(ids).not.toContain("bgsib");
  });

  it("drops a reaped bg session identified by its transcript's sessionKind", () => {
    const home = makeHome();
    // No registry file (reaped). Transcript carries sessionKind:"bg" on a turn line, mtime in window.
    writeTranscript(
      home,
      "-w-bg",
      "reapedbg",
      '{"type":"user","sessionKind":"bg","message":{"content":"hi"}}\n',
      NOW / 1000 - 1,
    );
    const ids = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    }).map((c) => c.id);
    expect(ids).not.toContain("reapedbg");
  });

  it("keeps a reaped interactive session (transcript with no sessionKind)", () => {
    const home = makeHome();
    writeTranscript(
      home,
      "-w-i",
      "reapedinter",
      '{"type":"user","message":{"content":"hi"}}\n',
      NOW / 1000 - 1,
    );
    const ids = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    }).map((c) => c.id);
    expect(ids).toContain("reapedinter");
  });

  it("drops a reaped bg session but keeps a reaped interactive session in the same pass", () => {
    const home = makeHome();
    writeTranscript(
      home,
      "-w-bg",
      "reapedbg",
      '{"type":"user","sessionKind":"bg","message":{"content":"hi"}}\n',
      NOW / 1000 - 1,
    );
    writeTranscript(
      home,
      "-w-i",
      "reapedinter",
      '{"type":"user","message":{"content":"hi"}}\n',
      NOW / 1000 - 1,
    );
    const ids = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    }).map((c) => c.id);
    expect(ids).not.toContain("reapedbg");
    expect(ids).toContain("reapedinter");
  });

  it("survives a reaped candidate whose transcript path is unreadable (a directory)", () => {
    const home = makeHome();
    // A directory named <id>.jsonl: indexTranscripts admits it, and the reaped-bg check opens it and
    // hits EISDIR on read. That must degrade to interactive (kept), not throw out of the whole sweep.
    const dir = join(home, "projects", "-w-bad", "baddir.jsonl");
    mkdirSync(dir, { recursive: true });
    utimesSync(dir, new Date(NOW - 1000), new Date(NOW - 1000)); // mtime inside the recency window
    const ids = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    }).map((c) => c.id);
    expect(ids).toContain("baddir");
  });

  it("keeps the freshest registry file per id (max updatedAt)", () => {
    const home = makeHome();
    writeSessionFile(home, {
      pid: 999,
      sessionId: "dup",
      cwd: "/w/stale",
      status: "idle",
      updatedAt: 1000,
    });
    writeSessionFile(home, {
      pid: 200,
      sessionId: "dup",
      cwd: "/w/fresh",
      status: "busy",
      updatedAt: 5000,
    });
    const dup = listCandidates({
      claudeDir: home,
      isPidAlive: () => true,
      now: NOW,
      recentWindowMs: WINDOW,
    }).filter((c) => c.id === "dup");
    expect(dup).toHaveLength(1);
    expect(dup[0].status).toBe("busy"); // the fresher file won
    expect(dup[0].cwd).toBe("/w/fresh");
  });
});

describe("readSessionFiles", () => {
  it("returns no sessions when the sessions path is not a directory", () => {
    const home = makeHome();
    writeFileSync(join(home, "sessions"), "not a directory"); // readdir → ENOTDIR
    expect(readSessionFiles(home)).toEqual([]);
  });

  it("skips session files whose pid is not a positive number", () => {
    const home = makeHome();
    writeSessionFile(home, { pid: 0, sessionId: "zero", cwd: "/w/x" });
    writeSessionFile(home, { pid: -3, sessionId: "neg", cwd: "/w/y" });
    writeSessionFile(home, { pid: 9, sessionId: "ok", cwd: "/w/z" });
    expect(readSessionFiles(home).map((s) => s.sessionId)).toEqual(["ok"]);
  });

  it("keeps kind and jobId when present", () => {
    const home = makeHome();
    writeSessionFile(home, {
      pid: 11,
      sessionId: "bg1",
      cwd: "/w/bg",
      kind: "bg",
      jobId: "bg1",
    });
    const [s] = readSessionFiles(home);
    expect(s.kind).toBe("bg");
    expect(s.jobId).toBe("bg1");
  });

  it("leaves kind and jobId undefined on a pre-field registry file", () => {
    const home = makeHome();
    writeSessionFile(home, { pid: 12, sessionId: "old", cwd: "/w/old" });
    const [s] = readSessionFiles(home);
    expect(s.kind).toBeUndefined();
    expect(s.jobId).toBeUndefined();
  });
});
