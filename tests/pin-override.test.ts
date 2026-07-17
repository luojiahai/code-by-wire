import { describe, it, expect } from "vitest";
import { applyPinOverrides } from "../src/shared/pin-override";
import type { Session } from "@shared/types";

const mk = (id: string): Session => ({
  id,
  title: "T",
  project: "p",
  state: "idle",
  management: "managed",
  resumable: true,
  model: "sonnet",
  contextPct: 0,
  contextWindow: 200_000,
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  },
  lastActivityMs: 0,
  createdMs: 0,
});

describe("applyPinOverrides", () => {
  it("stamps pinnedAtMs onto matching ids", () => {
    const out = applyPinOverrides([mk("a"), mk("b")], { a: 111 });
    expect(out[0].pinnedAtMs).toBe(111);
    expect(out[1].pinnedAtMs).toBeUndefined();
  });
  it("returns unmatched sessions by the same reference (cheap no-op pass)", () => {
    const b = mk("b");
    const out = applyPinOverrides([b], { a: 111 });
    expect(out[0]).toBe(b);
  });
});
