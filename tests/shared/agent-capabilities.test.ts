import { describe, expect, it } from "vitest";
import { AGENTS } from "../../src/shared/agents";

describe("agent capabilities", () => {
  it("codex telemetry flags: telemetry and rate limits on", () => {
    const caps = AGENTS.codex.capabilities;
    expect(caps.hasTelemetry).toBe(true);
    expect(caps.hasRateLimits).toBe(true);
    // still gated off — different features, not this plan's flips
    expect(caps.hasActivity).toBe(false);
    expect(caps.hasSubagents).toBe(false);
  });
  it("claude keeps the full stack", () => {
    expect(AGENTS.claude.capabilities.hasTelemetry).toBe(true);
  });
});
