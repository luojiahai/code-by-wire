import { describe, it, expect } from "vitest";
import type { Session } from "../../src/shared/types";
import {
  applyResuming,
  pruneResuming,
  dropResuming,
} from "../../src/shared/managed";

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

describe("applyResuming", () => {
  it("forces a resuming id to Managed and flips Ended to Working", () => {
    const [row] = applyResuming([s("a")], new Set(["a"]));
    expect(row.management).toBe("managed");
    expect(row.state).toBe("working");
  });

  it("leaves non-resuming rows untouched", () => {
    const [row] = applyResuming([s("b")], new Set(["a"]));
    expect(row.management).toBe("observed");
    expect(row.state).toBe("ended");
  });

  it("forces Managed but preserves a non-ended state", () => {
    const [row] = applyResuming([s("c", { state: "idle" })], new Set(["c"]));
    expect(row.management).toBe("managed");
    expect(row.state).toBe("idle");
  });

  it("returns the same array reference when nothing is resuming", () => {
    const rows = [s("d")];
    expect(applyResuming(rows, new Set())).toBe(rows);
  });
});

describe("pruneResuming", () => {
  it("keeps the override while a just-resumed id still reads Managed + Ended", () => {
    // The boot window: the managed registry flipped management to Managed, but `claude --resume`'s live
    // pid hasn't landed on disk yet, so discovery still derives Ended. Dropping the override here is the
    // flicker — the row bounces back to the Ended section before the live pid arrives.
    const next = pruneResuming(new Set(["a"]), [
      s("a", { management: "managed", state: "ended" }),
    ]);
    expect(next.has("a")).toBe(true);
  });

  it("drops the override once the id reads Managed and live", () => {
    const next = pruneResuming(new Set(["a"]), [
      s("a", { management: "managed", state: "idle" }),
    ]);
    expect(next.has("a")).toBe(false);
  });

  it("keeps an override discovery still labels Observed", () => {
    const next = pruneResuming(new Set(["a"]), [
      s("a", { management: "observed", state: "ended" }),
    ]);
    expect(next.has("a")).toBe(true);
  });

  it("returns the same Set reference when nothing settled", () => {
    const resuming = new Set(["a"]);
    expect(
      pruneResuming(resuming, [
        s("a", { management: "managed", state: "ended" }),
      ]),
    ).toBe(resuming);
  });

  it("returns the same Set reference when nothing is resuming", () => {
    const resuming = new Set<string>();
    expect(
      pruneResuming(resuming, [
        s("a", { management: "managed", state: "idle" }),
      ]),
    ).toBe(resuming);
  });
});

describe("dropResuming", () => {
  it("drops the override for the given id, leaving the rest", () => {
    const next = dropResuming(new Set(["a", "b"]), "a");
    expect(next.has("a")).toBe(false);
    expect(next.has("b")).toBe(true);
  });

  it("returns the same Set reference when the id wasn't resuming", () => {
    const resuming = new Set(["a"]);
    expect(dropResuming(resuming, "b")).toBe(resuming);
  });
});
