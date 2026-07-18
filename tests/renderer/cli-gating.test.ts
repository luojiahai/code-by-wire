import { describe, it, expect } from "vitest";
import { spawnGate, spawnGateFor } from "../../src/renderer/src/ui/cli-gating";
import type { CliStatus, CliStatusByAgent } from "../../src/shared/cli-status";

const mk = (kind: CliStatus["kind"]): CliStatus => ({
  kind,
  version: null,
  floor: "2.0.0",
  configDir: { active: "/c" },
  checkedAt: 1,
});

describe("spawnGate", () => {
  it("blocks spawning when not found or unknown", () => {
    expect(spawnGate(mk("notFound")).canSpawn).toBe(false);
    expect(spawnGate(mk("unknown")).canSpawn).toBe(false);
  });
  it("allows spawning (with the warning visible) when outdated / loggedOut / ready", () => {
    expect(spawnGate(mk("outdated")).canSpawn).toBe(true);
    expect(spawnGate(mk("loggedOut")).canSpawn).toBe(true);
    expect(spawnGate(mk("ready")).canSpawn).toBe(true);
  });
  it("allows spawning while the first check is pending (null) — don't block on unknowns", () => {
    expect(spawnGate(null).canSpawn).toBe(true);
  });
});

describe("spawnGateFor", () => {
  const byAgent: CliStatusByAgent = {
    claude: mk("notFound"),
    codex: mk("ready"),
  };
  it("gates on the named agent's own entry", () => {
    expect(spawnGateFor(byAgent, "claude").canSpawn).toBe(false);
    expect(spawnGateFor(byAgent, "codex").canSpawn).toBe(true);
  });
  it("allows spawning for a missing entry (check pending), same as spawnGate's null", () => {
    expect(spawnGateFor({}, "claude").canSpawn).toBe(true);
  });
  it("allows spawning when the whole record is null", () => {
    expect(spawnGateFor(null, "claude").canSpawn).toBe(true);
  });
});
