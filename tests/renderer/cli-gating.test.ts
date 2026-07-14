import { describe, it, expect } from "vitest";
import { spawnGate } from "../../src/renderer/src/ui/cli-gating";
import type { CliStatus } from "../../src/shared/cli-status";

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
