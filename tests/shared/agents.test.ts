import { describe, it, expect } from "vitest";
import {
  AGENT_IDS,
  AGENTS,
  isAgentId,
  agentOrDefault,
} from "../../src/shared/agents";

describe("AGENTS registry", () => {
  it("has one descriptor per id, self-keyed", () => {
    for (const id of AGENT_IDS) {
      expect(AGENTS[id].id).toBe(id);
      expect(AGENTS[id].label.length).toBeGreaterThan(0);
      expect(AGENTS[id].binary.length).toBeGreaterThan(0);
    }
  });
  it("claude has every capability; codex V3 has transcript + telemetry + rate limits", () => {
    expect(Object.values(AGENTS.claude.capabilities).every(Boolean)).toBe(true);
    const { hasTranscript, hasTelemetry, hasRateLimits, ...rest } =
      AGENTS.codex.capabilities;
    expect(hasTranscript).toBe(true);
    expect(hasTelemetry).toBe(true);
    expect(hasRateLimits).toBe(true);
    expect(Object.values(rest).some(Boolean)).toBe(false);
  });
  it("labels and binaries are the branded/spawnable names", () => {
    expect(AGENTS.claude).toMatchObject({
      label: "Claude Code",
      binary: "claude",
    });
    expect(AGENTS.codex).toMatchObject({ label: "Codex", binary: "codex" });
  });
});

describe("isAgentId / agentOrDefault", () => {
  it("recognizes exactly the registered ids", () => {
    expect(isAgentId("claude")).toBe(true);
    expect(isAgentId("codex")).toBe(true);
    expect(isAgentId("copilot")).toBe(false);
    expect(isAgentId(undefined)).toBe(false);
  });
  it("defaults anything unrecognized to claude (legacy rows)", () => {
    expect(agentOrDefault("codex")).toBe("codex");
    expect(agentOrDefault("garbage")).toBe("claude");
    expect(agentOrDefault(null)).toBe("claude");
  });
});
