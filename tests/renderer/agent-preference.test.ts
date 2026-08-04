import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadLastAgent,
  saveLastAgent,
  resolveDefaultAgent,
} from "../../src/renderer/src/shell/agent-preference";

const KEY = "cbw.lastAgent.v1";

describe("last-used agent preference", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips the last-used agent", () => {
    saveLastAgent(localStorage, "codex");
    expect(loadLastAgent(localStorage)).toBe("codex");
  });

  it("returns undefined when nothing is stored or the value is not an agent id", () => {
    expect(loadLastAgent(localStorage)).toBeUndefined();
    localStorage.setItem(KEY, "not-an-agent");
    expect(loadLastAgent(localStorage)).toBeUndefined();
  });

  it("ignores storage failures", () => {
    const failing = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("full");
      }),
    } as unknown as Storage;
    expect(loadLastAgent(failing)).toBeUndefined();
    expect(() => saveLastAgent(failing, "claude")).not.toThrow();
  });
});

describe("resolveDefaultAgent", () => {
  it("prefers the last-used agent when it is spawnable", () => {
    expect(resolveDefaultAgent(["claude", "codex"], "codex")).toBe("codex");
  });

  it("falls back to the first spawnable agent when last-used is not spawnable", () => {
    expect(resolveDefaultAgent(["codex"], "claude")).toBe("codex");
    expect(resolveDefaultAgent(["codex"], undefined)).toBe("codex");
  });

  it("falls back to claude when nothing is spawnable", () => {
    expect(resolveDefaultAgent([], undefined)).toBe("claude");
  });
});
