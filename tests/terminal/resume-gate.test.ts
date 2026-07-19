import { describe, it, expect } from "vitest";
import { gateResume, gateFork } from "../../src/main/terminal/resume-gate";

describe("gateResume", () => {
  it("refuses when nothing resolves the id", () => {
    expect(gateResume("claude", null)).toEqual({
      ok: false,
      reason: "unresolvable",
    });
  });
  it("refuses a live target — the one-process-per-transcript guard", () => {
    expect(gateResume("claude", { alive: true, cwd: "/w" })).toEqual({
      ok: false,
      reason: "alive",
    });
  });
  it("claude: proceeds with the resolved cwd and no claim binding", () => {
    expect(gateResume("claude", { alive: false, cwd: "/w" })).toEqual({
      ok: true,
      cwd: "/w",
      agent: "claude",
      claimedRollout: undefined,
    });
  });
  it("codex: proceeds and carries the rollout path out as the claim binding", () => {
    expect(
      gateResume("codex", { alive: false, cwd: "/w", rolloutPath: "/r.jsonl" }),
    ).toEqual({
      ok: true,
      cwd: "/w",
      agent: "codex",
      claimedRollout: "/r.jsonl",
    });
  });
});

describe("gateFork", () => {
  it("refuses a codex source — fork is claude-only", () => {
    expect(gateFork("codex", { alive: false, cwd: "/w" })).toEqual({
      ok: false,
      reason: "unresolvable",
    });
  });
  it("refuses an unresolvable source", () => {
    expect(gateFork("claude", null)).toEqual({
      ok: false,
      reason: "unresolvable",
    });
  });
  it("claude: proceeds with the resolved cwd — no liveness gate (a fork writes its own transcript)", () => {
    expect(gateFork("claude", { alive: true, cwd: "/w" })).toEqual({
      ok: true,
      cwd: "/w",
    });
  });
});
