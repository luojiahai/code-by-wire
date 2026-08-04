import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import type { SessionCandidate } from "@shared/types";
import { handleParseRequest } from "../../../src/main/parse-worker/protocol";

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

describe("handleParseRequest", () => {
  it("answers a request with the parsed snapshot under the same seq", () => {
    const res = handleParseRequest({ seq: 7, candidate: candidate() });
    expect(res.seq).toBe(7);
    if (!res.ok) throw new Error(res.error);
    // The real summarize ran against the fixture transcript.
    expect(res.session.title).toBe("Add a login form to the settings page");
  });

  it("never throws: a parse failure travels back as ok:false with the message", () => {
    const res = handleParseRequest({ seq: 3, candidate: candidate() }, () => {
      throw new Error("parse boom");
    });
    expect(res).toEqual({ seq: 3, ok: false, error: "parse boom" });
  });

  it("degrades an unreadable transcript to the registry skeleton, like in-process summarize", () => {
    // summarize's own unreadable-transcript fallback (registry title, no parse) must hold across
    // the worker boundary too — a bad file answers ok:true with the skeleton, not ok:false.
    const res = handleParseRequest({
      seq: 1,
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
    expect(res.session.title).toBe("app");
  });
});
