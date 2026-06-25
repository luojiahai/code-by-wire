import { describe, it, expect } from "vitest";
import type { Session } from "../../src/shared/types";
import {
  applyAdopting,
  pruneAdopting,
  dropAdopting,
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
  equivApiValueUsd: 0,
  lastActivityMs: 0,
  createdMs: 0,
  ...over,
});

describe("applyAdopting", () => {
  it("forces an adopting id to Managed and flips Ended to Working", () => {
    const [row] = applyAdopting([s("a")], new Set(["a"]));
    expect(row.management).toBe("managed");
    expect(row.state).toBe("working");
  });

  it("leaves non-adopting rows untouched", () => {
    const [row] = applyAdopting([s("b")], new Set(["a"]));
    expect(row.management).toBe("observed");
    expect(row.state).toBe("ended");
  });

  it("forces Managed but preserves a non-ended state", () => {
    const [row] = applyAdopting([s("c", { state: "idle" })], new Set(["c"]));
    expect(row.management).toBe("managed");
    expect(row.state).toBe("idle");
  });

  it("returns the same array reference when nothing is adopting", () => {
    const rows = [s("d")];
    expect(applyAdopting(rows, new Set())).toBe(rows);
  });
});

describe("pruneAdopting", () => {
  it("keeps the override while a just-adopted id still reads Managed + Ended", () => {
    // The boot window: the managed registry flipped management to Managed, but `claude --resume`'s live
    // pid hasn't landed on disk yet, so discovery still derives Ended. Dropping the override here is the
    // flicker — the row bounces back to the Ended section before the live pid arrives.
    const next = pruneAdopting(new Set(["a"]), [
      s("a", { management: "managed", state: "ended" }),
    ]);
    expect(next.has("a")).toBe(true);
  });

  it("drops the override once the id reads Managed and live", () => {
    const next = pruneAdopting(new Set(["a"]), [
      s("a", { management: "managed", state: "idle" }),
    ]);
    expect(next.has("a")).toBe(false);
  });

  it("keeps an override discovery still labels Observed", () => {
    const next = pruneAdopting(new Set(["a"]), [
      s("a", { management: "observed", state: "ended" }),
    ]);
    expect(next.has("a")).toBe(true);
  });

  it("returns the same Set reference when nothing settled", () => {
    const adopting = new Set(["a"]);
    expect(
      pruneAdopting(adopting, [
        s("a", { management: "managed", state: "ended" }),
      ]),
    ).toBe(adopting);
  });

  it("returns the same Set reference when nothing is adopting", () => {
    const adopting = new Set<string>();
    expect(
      pruneAdopting(adopting, [
        s("a", { management: "managed", state: "idle" }),
      ]),
    ).toBe(adopting);
  });
});

describe("dropAdopting", () => {
  it("drops the override for the given id, leaving the rest", () => {
    const next = dropAdopting(new Set(["a", "b"]), "a");
    expect(next.has("a")).toBe(false);
    expect(next.has("b")).toBe(true);
  });

  it("returns the same Set reference when the id wasn't adopting", () => {
    const adopting = new Set(["a"]);
    expect(dropAdopting(adopting, "b")).toBe(adopting);
  });
});
