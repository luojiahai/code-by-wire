import { describe, it, expect } from "vitest";
import type { Session } from "../../src/shared/types";
import { applyEnding, pruneEnding } from "../../src/shared/managed";

const s = (id: string, over: Partial<Session> = {}): Session => ({
  id,
  title: id,
  project: "p",
  state: "ended",
  management: "observed",
  resumable: true,
  model: "sonnet",
  contextPct: 0,
  contextWindow: 200_000,
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  },
  equivApiValueUsd: 0,
  lastActivityMs: 0,
  createdMs: 0,
  ...over,
});

describe("applyEnding", () => {
  it("forces an ending id to Ended", () => {
    const [row] = applyEnding(
      [s("a", { management: "managed", state: "working" })],
      new Set(["a"]),
    );
    expect(row.state).toBe("ended");
  });

  it("leaves management as-is so Adopt stays disabled until re-derived Observed", () => {
    const [row] = applyEnding(
      [s("a", { management: "managed", state: "working" })],
      new Set(["a"]),
    );
    expect(row.management).toBe("managed");
  });

  it("leaves non-ending rows untouched", () => {
    const [row] = applyEnding(
      [s("b", { management: "managed", state: "idle" })],
      new Set(["a"]),
    );
    expect(row.state).toBe("idle");
    expect(row.management).toBe("managed");
  });

  it("returns the same array reference when nothing is ending", () => {
    const rows = [s("d")];
    expect(applyEnding(rows, new Set())).toBe(rows);
  });
});

describe("pruneEnding", () => {
  it("keeps the override while the killed id still reads non-ended (pid teardown lag)", () => {
    const next = pruneEnding(new Set(["a"]), [
      s("a", { management: "managed", state: "working" }),
    ]);
    expect(next.has("a")).toBe(true);
  });

  it("drops the override once the id reads Ended", () => {
    const next = pruneEnding(new Set(["a"]), [
      s("a", { management: "observed", state: "ended" }),
    ]);
    expect(next.has("a")).toBe(false);
  });

  it("returns the same Set reference when nothing settled", () => {
    const ending = new Set(["a"]);
    expect(
      pruneEnding(ending, [
        s("a", { management: "managed", state: "working" }),
      ]),
    ).toBe(ending);
  });

  it("returns the same Set reference when nothing is ending", () => {
    const ending = new Set<string>();
    expect(pruneEnding(ending, [s("a", { state: "ended" })])).toBe(ending);
  });
});
