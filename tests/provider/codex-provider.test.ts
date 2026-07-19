import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  utimesSync,
  appendFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCodexProvider,
  CODEX_WORKING_WINDOW_MS,
} from "../../src/main/provider/codex";
import type { Session } from "@shared/types";

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

  it("unimplemented readers settle absent; resolveSessionCwd works", () => {
    const { home } = homeWithOneRollout();
    const p = createCodexProvider({ codexDir: home, now: () => Date.now() });
    expect(p.readTasks(ID)).toEqual({ status: "absent" });
    expect(p.readShells(ID)).toEqual({ status: "absent" });
    expect(p.readMonitors(ID)).toEqual({ status: "absent" });
    // readMetrics is live (not stubbed): the fixture rollout resolves, so this settles a changed
    // snapshot rather than absent — the fixture cwd isn't a real repo, so git/pr/speed are null.
    expect(p.readMetrics(ID)).toMatchObject({
      status: "changed",
      metrics: {
        tokenSpeed: null,
        git: null,
        pr: null,
        voiceEnabled: null,
        remoteControl: null,
      },
    });
    expect(p.readSubagentTranscript(ID, "a")).toEqual({ status: "absent" });
    expect(p.readShellOutput(ID, "s")).toEqual({ status: "absent" });
    expect(p.readMonitorOutput(ID, "m")).toEqual({ status: "absent" });
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

  describe("resolveResumeTarget", () => {
    it("stale observed rollout → resumable: not alive, head cwd, rollout path", () => {
      const { home, path } = homeWithOneRollout();
      const now = Date.now();
      const stale = (now - CODEX_WORKING_WINDOW_MS - 60_000) / 1000;
      utimesSync(path, stale, stale);
      const p = createCodexProvider({ codexDir: home, now: () => now });
      expect(p.resolveResumeTarget(ID)).toEqual({
        alive: false,
        cwd: "/Users/me/proj",
        rolloutPath: path,
      });
    });

    it("fresh mtime → alive (an external writer may still own it)", () => {
      const { home } = homeWithOneRollout();
      const p = createCodexProvider({ codexDir: home, now: () => Date.now() });
      expect(p.resolveResumeTarget(ID)?.alive).toBe(true);
    });

    it("managed id → alive even when the rollout is stale (the app's own pty owns it)", () => {
      const { home, path } = homeWithOneRollout();
      const now = Date.now();
      const stale = (now - CODEX_WORKING_WINDOW_MS - 60_000) / 1000;
      utimesSync(path, stale, stale);
      const p = createCodexProvider({
        codexDir: home,
        now: () => now,
        managed: { has: (id) => id === ID },
      });
      expect(p.resolveResumeTarget(ID)?.alive).toBe(true);
    });

    it("unknown id → null (nothing to resume)", () => {
      const { home } = homeWithOneRollout();
      const p = createCodexProvider({ codexDir: home, now: () => Date.now() });
      expect(
        p.resolveResumeTarget("99999999-0000-0000-0000-000000000000"),
      ).toBeNull();
    });
  });
});

const ROLLOUT_ID = "11111111-2222-3333-4444-555555555555";

function writeTelemetryRollout(codexDir: string): string {
  const dir = join(codexDir, "sessions", "2026", "07", "19");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `rollout-2026-07-19T10-00-00-${ROLLOUT_ID}.jsonl`);
  const lines = [
    JSON.stringify({
      timestamp: "2026-07-19T10:00:00.000Z",
      type: "session_meta",
      payload: {
        id: ROLLOUT_ID,
        cwd: "/work/thing",
        timestamp: "2026-07-19T10:00:00.000Z",
      },
    }),
    JSON.stringify({
      timestamp: "2026-07-19T10:00:01.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "hello codex" }],
      },
    }),
    JSON.stringify({
      timestamp: "2026-07-19T10:00:02.000Z",
      type: "turn_context",
      payload: { model: "gpt-5.3-codex", effort: "medium" },
    }),
    JSON.stringify({
      timestamp: "2026-07-19T10:00:10.000Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 1_000,
            cached_input_tokens: 600,
            output_tokens: 200,
            total_tokens: 1_200,
          },
          last_token_usage: {
            input_tokens: 1_000,
            cached_input_tokens: 600,
            output_tokens: 200,
            total_tokens: 142_000,
          },
          model_context_window: 272_000,
        },
        rate_limits: null,
      },
    }),
  ];
  writeFileSync(path, lines.join("\n"));
  return path;
}

describe("codex telemetry (summarize + overlay + readMetrics)", () => {
  it("summarize fills usage, per-model attribution, model, effort from the rollout", () => {
    const codexDir = mkdtempSync(join(tmpdir(), "codex-telemetry-"));
    try {
      writeTelemetryRollout(codexDir);
      const provider = createCodexProvider({ codexDir });
      const c = provider.listCandidates().find((x) => x.id === ROLLOUT_ID)!;
      const s = provider.summarize(c);
      expect(s.usage.inputTokens).toBe(400);
      expect(s.usage.cacheReadTokens).toBe(600);
      expect(s.usageByModel).toEqual([
        {
          modelRaw: "gpt-5.3-codex",
          usage: expect.objectContaining({ inputTokens: 400 }),
        },
      ]);
      expect(s.modelRaw).toBe("gpt-5.3-codex");
      expect(s.effortLevel).toBe("medium");
      expect(s.contextTokens).toBe(142_000);
    } finally {
      rmSync(codexDir, { recursive: true, force: true });
    }
  });

  it("overlaySessions attaches liveContext, real window, TUI contextPct, and rateLimits to codex rows only", () => {
    const codexDir = mkdtempSync(join(tmpdir(), "codex-overlay-"));
    try {
      writeTelemetryRollout(codexDir);
      const limits = {
        read: () => ({
          fiveHour: { usedPct: 42, resetsAt: 1_800_000_000_000 },
        }),
      };
      const provider = createCodexProvider({ codexDir, limits });
      const codexRow = {
        id: ROLLOUT_ID,
        agent: "codex",
        contextPct: 0,
        contextWindow: 200_000,
      } as Session;
      const claudeRow = {
        id: "other",
        agent: "claude",
        contextPct: 7,
        contextWindow: 200_000,
      } as Session;
      const [codexOut, claudeOut] = provider.overlaySessions([
        codexRow,
        claudeRow,
      ]);
      expect(codexOut.contextWindow).toBe(272_000);
      expect(codexOut.contextPct).toBe(50); // TUI formula: (142k−12k)/(272k−12k) used → fill 50
      expect(codexOut.liveContext).toEqual({
        input: 400,
        cacheRead: 600,
        cacheCreation: 0,
      });
      expect(codexOut.rateLimits?.fiveHour?.usedPct).toBe(42);
      expect(claudeOut).toBe(claudeRow); // non-codex rows pass through untouched
    } finally {
      rmSync(codexDir, { recursive: true, force: true });
    }
  });

  it("readMetrics returns a changed snapshot with the unchanged-token contract", () => {
    const codexDir = mkdtempSync(join(tmpdir(), "codex-metrics-"));
    try {
      writeTelemetryRollout(codexDir);
      const provider = createCodexProvider({ codexDir });
      const first = provider.readMetrics(ROLLOUT_ID);
      expect(first.status).toBe("changed");
      if (first.status !== "changed") return;
      // one token_count → no completed interval → null speed; temp cwd is not a repo → null git
      expect(first.metrics.tokenSpeed).toBeNull();
      expect(first.metrics.voiceEnabled).toBeNull();
      expect(first.metrics.remoteControl).toBeNull();
      const second = provider.readMetrics(ROLLOUT_ID, first.mtimeMs);
      expect(second.status).toBe("unchanged");
    } finally {
      rmSync(codexDir, { recursive: true, force: true });
    }
  });

  it("readMetrics settles absent for an unknown id", () => {
    const codexDir = mkdtempSync(join(tmpdir(), "codex-metrics-absent-"));
    try {
      const provider = createCodexProvider({ codexDir });
      expect(provider.readMetrics("no-such-id").status).toBe("absent");
    } finally {
      rmSync(codexDir, { recursive: true, force: true });
    }
  });
});
