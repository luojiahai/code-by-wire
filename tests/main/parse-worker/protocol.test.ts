import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import type { SessionCandidate } from "@shared/types";
import { createParseRequestHandler } from "../../../src/main/parse-worker/protocol";
import type { ClaudeReader } from "../../../src/main/provider/claude/reader";

const CLAUDE_DIR = resolve("tests/fixtures/claude-home");

const candidate = (over: Partial<SessionCandidate> = {}): SessionCandidate => ({
  id: "aaaa1111-1111-1111-1111-111111111111",
  alive: true,
  status: "busy",
  cwd: "",
  agent: "claude",
  transcriptPath: resolve(
    CLAUDE_DIR,
    "projects",
    "-work-code-by-wire",
    "aaaa1111-1111-1111-1111-111111111111.jsonl",
  ),
  transcriptMtimeMs: 1,
  ...over,
});

describe("createParseRequestHandler", () => {
  it("answers a summarize request with the parsed snapshot under the same seq", () => {
    const handle = createParseRequestHandler();
    const res = handle({ seq: 7, op: "summarize", candidate: candidate() });
    expect(res.seq).toBe(7);
    if (!res.ok) throw new Error(res.error);
    // The real summarize ran against the fixture transcript.
    expect(res.result).toMatchObject({
      title: "Add a login form to the settings page",
    });
  });

  it("never throws: a failure travels back as ok:false with the message", () => {
    const handle = createParseRequestHandler({
      parse: () => {
        throw new Error("parse boom");
      },
    });
    const res = handle({ seq: 3, op: "summarize", candidate: candidate() });
    expect(res).toEqual({ seq: 3, ok: false, error: "parse boom" });
  });

  it("degrades an unreadable transcript to the registry skeleton, like in-process summarize", () => {
    // summarize's own unreadable-transcript fallback (registry title, no parse) must hold across
    // the worker boundary too — a bad file answers ok:true with the skeleton, not ok:false.
    const handle = createParseRequestHandler();
    const res = handle({
      seq: 1,
      op: "summarize",
      candidate: candidate({
        transcriptPath: resolve(
          CLAUDE_DIR,
          "projects",
          "-work-code-by-wire",
          "nope.jsonl",
        ),
        cwd: "/work/app",
      }),
    });
    if (!res.ok) throw new Error(res.error);
    expect(res.result).toMatchObject({ title: "app" });
  });

  it("serves a real readTranscript against the fixture home as wire JSON", () => {
    const handle = createParseRequestHandler();
    const res = handle({
      seq: 2,
      op: "readTranscript",
      claudeDir: CLAUDE_DIR,
      id: "aaaa1111-1111-1111-1111-111111111111",
    });
    if (!res.ok) throw new Error(res.error);
    const wire = res.result as { status: string; docJson?: string };
    expect(wire.status).toBe("changed");
    // The doc crosses the port as ONE string, parseable back into events on the far side.
    const doc = JSON.parse(wire.docJson!) as { events: unknown[] };
    expect(doc.events.length).toBeGreaterThan(0);
  });

  it("memoizes one reader per claudeDir so its caches survive across requests", () => {
    const made: string[] = [];
    const reader = (dir: string): ClaudeReader =>
      ({
        readTasks: () => {
          made.push(dir);
          return { status: "absent" as const };
        },
      }) as unknown as ClaudeReader;
    // The default readerFor memoizes; with the seam we instead prove the handler ROUTES by dir.
    const handle = createParseRequestHandler({ readerFor: reader });
    handle({ seq: 1, op: "readTasks", claudeDir: "/a", id: "s" });
    handle({ seq: 2, op: "readTasks", claudeDir: "/b", id: "s" });
    expect(made).toEqual(["/a", "/b"]);
  });

  it("lists real candidates from the fixture home through the listCandidates op", () => {
    const handle = createParseRequestHandler();
    const res = handle({
      seq: 5,
      op: "listCandidates",
      claudeDir: CLAUDE_DIR,
      now: Date.now(),
      recentWindowMs: Number.MAX_SAFE_INTEGER,
    });
    if (!res.ok) throw new Error(res.error);
    const ids = (res.result as SessionCandidate[]).map((c) => c.id);
    expect(ids).toContain("aaaa1111-1111-1111-1111-111111111111");
  });

  it("routes readSessionFiles and scanClaimableRollouts through their seams", () => {
    const handle = createParseRequestHandler({
      readSessionFiles: (dir) => [
        { pid: 1, sessionId: `s-${dir}`, cwd: "/w" },
      ],
      scanRollouts: (dir, earliestMs, claimed) => [
        {
          path: `${dir}/r.jsonl`,
          id: "r",
          timestampMs: earliestMs,
          cwd: claimed[0] ?? "/w",
        },
      ],
    });
    const files = handle({ seq: 1, op: "readSessionFiles", claudeDir: "/c" });
    if (!files.ok) throw new Error(files.error);
    expect(files.result).toEqual([{ pid: 1, sessionId: "s-/c", cwd: "/w" }]);

    const scan = handle({
      seq: 2,
      op: "scanClaimableRollouts",
      codexDir: "/x",
      earliestMs: 9,
      claimedPaths: ["/w2"],
    });
    if (!scan.ok) throw new Error(scan.error);
    expect(scan.result).toEqual([
      { path: "/x/r.jsonl", id: "r", timestampMs: 9, cwd: "/w2" },
    ]);
  });
});
