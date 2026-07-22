import { describe, it, expect } from "vitest";
import { createCompositeProvider } from "../../src/main/provider/composite";
import type { Provider } from "../../src/main/provider/types";
import type { SessionCandidate } from "@shared/types";

const cand = (id: string, agent: "claude" | "codex"): SessionCandidate => ({
  id,
  agent,
  alive: false,
  cwd: "/w",
  transcriptMtimeMs: 1,
});
function fake(agent: "claude" | "codex", calls: string[]): Provider {
  return {
    id: agent,
    listCandidates: () => [cand(`${agent}-1`, agent)],
    summarize: (c) => {
      calls.push(`summarize:${agent}:${c.id}`);
      return {} as never;
    },
    restate: (c, p) => {
      calls.push(`restate:${agent}:${c.id}`);
      return p;
    },
    readTranscript: (id) => {
      calls.push(`readTranscript:${agent}:${id}`);
      return { status: "absent" };
    },
    getToolResult: () => ({ found: false }),
    readSubagentTranscript: () => ({ status: "absent" }),
    readTasks: () => ({ status: "absent" }),
    readShells: () => ({ status: "absent" }),
    readShellOutput: () => ({ status: "absent" }),
    readMonitors: () => ({ status: "absent" }),
    readMonitorOutput: () => ({ status: "absent" }),
    readMetrics: () => ({ status: "absent" }),
    resolveResumeTarget: (id) => {
      calls.push(`resume:${agent}:${id}`);
      return null;
    },
    resolveSessionCwd: (id) => {
      calls.push(`cwd:${agent}:${id}`);
      return null;
    },
    resolveTranscriptPath: (id) => {
      calls.push(`path:${agent}:${id}`);
      return null;
    },
  };
}

describe("createCompositeProvider", () => {
  it("unions listCandidates and dispatches summarize/restate by candidate.agent", () => {
    const calls: string[] = [];
    const p = createCompositeProvider(
      { claude: fake("claude", calls), codex: fake("codex", calls) },
      () => "claude",
    );
    const cands = p.listCandidates();
    expect(cands.map((c) => c.id).sort()).toEqual(["claude-1", "codex-1"]);
    p.summarize(cands.find((c) => c.agent === "codex")!);
    expect(calls).toContain("summarize:codex:codex-1");
  });
  it("routes per-id reads through the agent resolver", () => {
    const calls: string[] = [];
    const p = createCompositeProvider(
      { claude: fake("claude", calls), codex: fake("codex", calls) },
      (id) => (id.startsWith("codex") ? "codex" : "claude"),
    );
    p.readTranscript("codex-9");
    p.resolveSessionCwd("someone");
    p.resolveTranscriptPath("codex-10");
    expect(calls).toContain("readTranscript:codex:codex-9");
    expect(calls).toContain("cwd:claude:someone");
    expect(calls).toContain("path:codex:codex-10");
  });
});
