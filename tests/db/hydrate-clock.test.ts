import { describe, expect, it } from "vitest";
import { hydrate } from "../../src/main/db/store";
import type { PersistedSession } from "@shared/types";

function persisted(over: Partial<PersistedSession>): PersistedSession {
  return {
    id: "s1",
    title: "t",
    project: "p",
    cwd: "",
    state: "ended",
    management: "observed",
    model: "opus",
    lastActivityMs: 0,
    createdMs: 0,
    awaitingUser: false,
    transcriptMtimeMs: 0,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      cacheCreation5mTokens: 0,
      cacheCreation1hTokens: 0,
    },
    contextTokens: 0,
    ...over,
  };
}

describe("hydrate session clock fallback (A5, ccs getSessionDuration)", () => {
  it("first→last transcript delta when both timestamps are positive", () => {
    const s = hydrate(persisted({ createdMs: 1_000, lastActivityMs: 61_000 }));
    expect(s.sessionClockMs).toBe(60_000);
  });
  it("guards: zero createdMs, zero lastActivityMs, negative delta → no clock", () => {
    expect(
      hydrate(persisted({ createdMs: 0, lastActivityMs: 5 })).sessionClockMs,
    ).toBeUndefined();
    expect(
      hydrate(persisted({ createdMs: 5, lastActivityMs: 0 })).sessionClockMs,
    ).toBeUndefined();
    expect(
      hydrate(persisted({ createdMs: 10, lastActivityMs: 5 })).sessionClockMs,
    ).toBeUndefined();
  });
});
