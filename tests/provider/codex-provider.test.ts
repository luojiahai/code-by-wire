import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
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

  it("empty readers settle absent/not-found; resolveResumeTarget null; resolveSessionCwd works", () => {
    const { home } = homeWithOneRollout();
    const p = createCodexProvider({ codexDir: home, now: () => Date.now() });
    expect(p.readTranscript(ID)).toEqual({ status: "absent" });
    expect(p.readTasks(ID)).toEqual({ status: "absent" });
    expect(p.readShells(ID)).toEqual({ status: "absent" });
    expect(p.readMonitors(ID)).toEqual({ status: "absent" });
    expect(p.readMetrics(ID)).toEqual({ status: "absent" });
    expect(p.readSubagentTranscript(ID, "a")).toEqual({ status: "absent" });
    expect(p.readShellOutput(ID, "s")).toEqual({ status: "absent" });
    expect(p.readMonitorOutput(ID, "m")).toEqual({ status: "absent" });
    expect(p.getToolResult(ID, "t")).toEqual({ found: false });
    expect(p.resolveResumeTarget(ID)).toBeNull();
    expect(p.resolveSessionCwd(ID)).toBe("/Users/me/proj");
    expect(p.resolveSessionCwd("unknown")).toBeNull();
  });
});
