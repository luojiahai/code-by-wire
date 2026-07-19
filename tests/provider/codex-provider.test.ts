import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  utimesSync,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCodexProvider,
  CODEX_WORKING_WINDOW_MS,
} from "../../src/main/provider/codex";

const ID = "11111111-2222-3333-4444-555555555555";
const META = `{"timestamp":"2026-07-18T10:30:01.000Z","type":"session_meta","payload":{"id":"${ID}","timestamp":"2026-07-18T10:30:01.000Z","cwd":"/Users/me/proj","originator":"codex_cli_rs","cli_version":"0.29.0"}}`;
const USER = `{"timestamp":"2026-07-18T10:30:05.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"add dark mode"}]}}`;

function homeWithOneRollout(): { home: string; path: string } {
  const home = mkdtempSync(join(tmpdir(), "codexp-"));
  const day = join(home, "sessions", "2026", "07", "18");
  mkdirSync(day, { recursive: true });
  const path = join(day, `rollout-2026-07-18T10-30-01-${ID}.jsonl`);
  writeFileSync(path, [META, USER].join("\n"));
  return { home, path };
}

describe("createCodexProvider", () => {
  it("lists a candidate per rollout, tagged agent codex, with the head cwd", () => {
    const { home } = homeWithOneRollout();
    const p = createCodexProvider({ codexDir: home, now: () => Date.now() });
    const [c] = p.listCandidates();
    expect(c).toMatchObject({ id: ID, agent: "codex", cwd: "/Users/me/proj" });
    expect(c.transcriptMtimeMs).toBeGreaterThan(0);
  });

  it("observed + fresh mtime → working; observed + stale → ended", () => {
    const { home, path } = homeWithOneRollout();
    const now = Date.now();
    const p = createCodexProvider({ codexDir: home, now: () => now });
    let [c] = p.listCandidates();
    expect(p.summarize(c).state).toBe("working"); // file just written → fresh
    const stale = (now - CODEX_WORKING_WINDOW_MS - 60_000) / 1000;
    utimesSync(path, stale, stale);
    [c] = p.listCandidates();
    expect(p.summarize(c).state).toBe("ended");
  });

  it("managed + fresh → working; managed + stale → idle (pty alive, codex at the prompt)", () => {
    const { home, path } = homeWithOneRollout();
    const now = Date.now();
    const p = createCodexProvider({
      codexDir: home,
      now: () => now,
      managed: { has: (id) => id === ID },
    });
    let s = p.summarize(p.listCandidates()[0]);
    expect(s.state).toBe("working");
    expect(s.management).toBe("managed");
    const stale = (now - CODEX_WORKING_WINDOW_MS - 5_000) / 1000;
    utimesSync(path, stale, stale);
    s = p.summarize(p.listCandidates()[0]);
    expect(s.state).toBe("idle");
  });

  it("summarize carries the head title, agent codex, placeholder model, zero usage", () => {
    const { home } = homeWithOneRollout();
    const p = createCodexProvider({ codexDir: home, now: () => Date.now() });
    const s = p.summarize(p.listCandidates()[0]);
    expect(s.title).toBe("add dark mode");
    expect(s.agent).toBe("codex");
    expect(s.usage.inputTokens).toBe(0);
    expect(s.createdMs).toBe(Date.parse("2026-07-18T10:30:01.000Z"));
  });

  it("a stale rollout claimed by a live pty still surfaces as a candidate", () => {
    const { home, path } = homeWithOneRollout();
    const now = Date.now();
    const stale = (now - 40 * 24 * 60 * 60 * 1000) / 1000; // beyond any recent window
    utimesSync(path, stale, stale);
    const without = createCodexProvider({ codexDir: home, now: () => now });
    expect(without.listCandidates()).toHaveLength(0);
    const withPty = createCodexProvider({
      codexDir: home,
      now: () => now,
      managed: { has: (id) => id === ID },
    });
    expect(withPty.listCandidates()).toHaveLength(1);
  });

  it("unimplemented readers settle absent; resolveResumeTarget null; resolveSessionCwd works", () => {
    const { home } = homeWithOneRollout();
    const p = createCodexProvider({ codexDir: home, now: () => Date.now() });
    expect(p.readTasks(ID)).toEqual({ status: "absent" });
    expect(p.readShells(ID)).toEqual({ status: "absent" });
    expect(p.readMonitors(ID)).toEqual({ status: "absent" });
    expect(p.readMetrics(ID)).toEqual({ status: "absent" });
    expect(p.readSubagentTranscript(ID, "a")).toEqual({ status: "absent" });
    expect(p.readShellOutput(ID, "s")).toEqual({ status: "absent" });
    expect(p.readMonitorOutput(ID, "m")).toEqual({ status: "absent" });
    expect(p.resolveResumeTarget(ID)).toBeNull();
    expect(p.resolveSessionCwd(ID)).toBe("/Users/me/proj");
    expect(p.resolveSessionCwd("unknown")).toBeNull();
  });

  it("readTranscript parses the rollout and honors the mtime change token", () => {
    const { home, path } = homeWithOneRollout();
    const p = createCodexProvider({ codexDir: home, now: () => Date.now() });
    const first = p.readTranscript(ID);
    if (first.status !== "changed")
      throw new Error(`expected changed, got ${first.status}`);
    expect(first.doc.events).toEqual([{ kind: "user", text: "add dark mode" }]);
    expect(first.doc.subagents).toEqual([]);
    expect(first.doc.waitingReason).toBeNull();
    expect(p.readTranscript(ID, first.mtimeMs)).toEqual({
      status: "unchanged",
      mtimeMs: first.mtimeMs,
    });
    const ASSIST = JSON.stringify({
      timestamp: "2026-07-18T10:30:09.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "On it." }],
      },
    });
    appendFileSync(path, "\n" + ASSIST);
    const later = (first.mtimeMs + 5_000) / 1000;
    utimesSync(path, later, later);
    const second = p.readTranscript(ID, first.mtimeMs);
    if (second.status !== "changed")
      throw new Error(`expected changed, got ${second.status}`);
    expect(second.doc.events).toHaveLength(2);
  });

  it("readTranscript settles absent for an unknown id", () => {
    const { home } = homeWithOneRollout();
    const p = createCodexProvider({ codexDir: home, now: () => Date.now() });
    expect(p.readTranscript("00000000-0000-0000-0000-000000000000")).toEqual({
      status: "absent",
    });
  });

  it("getToolResult pulls the full command and output by call id", () => {
    const { home, path } = homeWithOneRollout();
    const CALL = JSON.stringify({
      timestamp: "2026-07-18T10:30:06.000Z",
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        call_id: "call_1",
        name: "exec",
        input: 'await tools.exec_command({"cmd":"pwd"});',
      },
    });
    const OUT = JSON.stringify({
      timestamp: "2026-07-18T10:30:07.000Z",
      type: "response_item",
      payload: {
        type: "custom_tool_call_output",
        call_id: "call_1",
        output: "/Users/me/proj\n",
      },
    });
    appendFileSync(path, "\n" + CALL + "\n" + OUT);
    const p = createCodexProvider({ codexDir: home, now: () => Date.now() });
    expect(p.getToolResult(ID, "call_1")).toEqual({
      found: true,
      command: "pwd",
      output: "/Users/me/proj\n",
      status: "ok",
    });
    expect(p.getToolResult(ID, "nope")).toEqual({ found: false });
    expect(p.getToolResult("unknown-id", "call_1")).toEqual({ found: false });
  });
});
