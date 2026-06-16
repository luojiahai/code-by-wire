import { describe, it, expect } from "vitest";
import {
  evaluateCliStatus,
  MIN_CLAUDE_VERSION,
  type CliProbeInput,
} from "../../src/main/cli-status";

const base: CliProbeInput = {
  path: "/Users/me/.local/bin/claude",
  source: "shell",
  isRegularFile: true,
  duplicates: ["/Users/me/.local/bin/claude"],
  version: { status: "ok", raw: "2.1.178" },
  auth: { status: "ok" },
  floor: MIN_CLAUDE_VERSION,
  installMethod: "native",
  configDir: { active: "/Users/me/.claude", recovered: null },
  now: 1_000,
};

describe("evaluateCliStatus", () => {
  it("ready when found, runs, >= floor, logged in", () => {
    expect(evaluateCliStatus(base).kind).toBe("ready");
  });
  it("notFound when the path is null", () => {
    expect(evaluateCliStatus({ ...base, path: null }).kind).toBe("notFound");
  });
  it("notFound when the resolved target is not a regular file (an alias/function)", () => {
    expect(evaluateCliStatus({ ...base, isRegularFile: false }).kind).toBe(
      "notFound",
    );
  });
  it("notFound when the binary vanished between resolve and run (spawn error)", () => {
    expect(
      evaluateCliStatus({ ...base, version: { status: "spawnError" } }).kind,
    ).toBe("notFound");
  });
  it("unknown when it ran but the version was unparsable", () => {
    expect(
      evaluateCliStatus({ ...base, version: { status: "ok", raw: "???" } })
        .kind,
    ).toBe("unknown");
  });
  it("unknown when the version run failed (non-zero / timeout)", () => {
    expect(
      evaluateCliStatus({ ...base, version: { status: "failed" } }).kind,
    ).toBe("unknown");
  });
  it("outdated when below the floor", () => {
    const r = evaluateCliStatus({
      ...base,
      version: { status: "ok", raw: "1.9.0" },
    });
    expect(r.kind).toBe("outdated");
    expect(r.detail).toContain(MIN_CLAUDE_VERSION);
  });
  it("loggedOut when compatible but auth status exited 1", () => {
    expect(
      evaluateCliStatus({ ...base, auth: { status: "loggedOut" } }).kind,
    ).toBe("loggedOut");
  });
  it("does NOT cry logged-out when the auth probe itself failed", () => {
    expect(
      evaluateCliStatus({ ...base, auth: { status: "unknown" } }).kind,
    ).toBe("ready");
  });
  it("flags a config-dir mismatch we could not resolve", () => {
    const r = evaluateCliStatus({
      ...base,
      configDir: { active: "/Users/me/.claude", recovered: "/custom/claude" },
    });
    expect(r.configDir.mismatch).toBe(true);
  });
});
