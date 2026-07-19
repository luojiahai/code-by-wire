import { describe, expect, it } from "vitest";
import { AGENTS } from "../../src/shared/agents";

describe("agent capabilities", () => {
  it("codex has the four-panel telemetry stack: telemetry on, duty off", () => {
    const caps = AGENTS.codex.capabilities;
    expect(caps.hasTelemetry).toBe(true);
    expect(caps.hasRateLimits).toBe(true);
    expect(caps.hasDuty).toBe(false);
    // still gated off — different features, not this plan's flips
    expect(caps.hasActivity).toBe(false);
    expect(caps.hasSubagents).toBe(false);
  });
  it("claude keeps the full stack including duty", () => {
    expect(AGENTS.claude.capabilities.hasDuty).toBe(true);
    expect(AGENTS.claude.capabilities.hasTelemetry).toBe(true);
  });
});
