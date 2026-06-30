import { describe, it, expect } from "vitest";
import type { Session } from "../../src/shared/types";
import { applyEnding, pruneEnding, dropEnding } from "../../src/shared/managed";

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
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  },
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

describe("dropEnding", () => {
  it("drops the id a racing Adopt revived (so pruneEnding can't strand a now-live row)", () => {
    // The strand: End is clicked during an in-flight Adopt, its kill no-ops on a pty that doesn't exist
    // yet, the Adopt then revives the row to a stable live-Managed state, and pruneEnding never sees it
    // Ended. dropEnding (called on adopt-success) is the escape hatch. Mirror pruneEnding's lag test: the
    // revived row reads managed/working, which pruneEnding deliberately HOLDS — only dropEnding clears it.
    const next = dropEnding(new Set(["a", "b"]), "a");
    expect(next.has("a")).toBe(false);
    expect(next.has("b")).toBe(true);
  });

  it("returns the same Set reference when the id wasn't ending", () => {
    const ending = new Set(["a"]);
    expect(dropEnding(ending, "b")).toBe(ending);
  });
});
