import { describe, expect, it } from "vitest";
import {
  deriveAccount,
  overlaySessions,
  type AccountUsage,
  type StatusLineSample,
} from "@shared/statusline";
import type { Session } from "@shared/types";

const NOW = 1_760_000_000_000;
const STALE = 7 * 24 * 60 * 60 * 1000;

function sample(over: Partial<StatusLineSample>): StatusLineSample {
  return {
    sessionId: "s1",
    capturedMtimeMs: NOW,
    costUsd: null,
    linesAdded: null,
    linesRemoved: null,
    contextPct: null,
    contextWindow: null,
    liveContext: null,
    modelId: null,
    modelDisplayName: null,
    sessionName: null,
    version: null,
    effortLevel: null,
    cwd: null,
    sessionClockMs: null,
    apiDurationMs: null,
    pr: null,
    rateLimits: null,
    ...over,
  };
}

const api: AccountUsage = {
  fiveHour: { usedPct: 12, resetsAt: NOW + 60_000 },
  sevenDay: { usedPct: 22, resetsAt: NOW + 86_400_000 },
};

describe("deriveAccount", () => {
  it("windows are a pass-through of the API usage", () => {
    const acc = deriveAccount([], NOW, STALE, api);
    expect(acc).not.toBeNull();
    expect(acc?.billingMode).toBe("subscription");
    expect(acc?.fiveHour).toEqual(api.fiveHour);
    expect(acc?.sevenDay).toEqual(api.sevenDay);
    expect(acc?.sevenDaySonnet).toBeUndefined();
  });

  it("an API window whose reset already passed is dropped (liveWindow guard)", () => {
    const acc = deriveAccount([], NOW, STALE, {
      sevenDay: { usedPct: 38, resetsAt: NOW - 1 },
    });
    expect(acc?.sevenDay).toBeUndefined();
  });

  it("subscription with ZERO captures when the API responds (wrapper not installed)", () => {
    const acc = deriveAccount([], NOW, STALE, {});
    expect(acc?.billingMode).toBe("subscription");
  });

  it("subscription via capture rate_limits evidence when the API has nothing", () => {
    const s = sample({
      rateLimits: { sevenDay: { usedPct: 9, resetsAt: NOW + 1 } },
    });
    const acc = deriveAccount([s], NOW, STALE, null);
    expect(acc?.billingMode).toBe("subscription");
    // Account windows come ONLY from the API — the capture's window is per-session now.
    expect(acc?.sevenDay).toBeUndefined();
  });

  it("stays subscription when the freshest sample lacks rate_limits but an older fresh one carries them", () => {
    // sawRateLimits scans EVERY fresh sample, not just the freshest: an idle session that hasn't had
    // its first API response (no rate_limits) can write the newest capture while an older fresh
    // session still carries window evidence — the account must not flip to api.
    const older = sample({
      sessionId: "a",
      capturedMtimeMs: NOW - 1_000,
      rateLimits: { fiveHour: { usedPct: 30, resetsAt: NOW + 3_600_000 } },
    });
    const newer = sample({
      sessionId: "b",
      capturedMtimeMs: NOW,
      rateLimits: null,
    });
    expect(deriveAccount([newer, older], NOW, STALE, null)?.billingMode).toBe(
      "subscription",
    );
  });

  it("api billing when neither API usage nor rate_limits evidence exists", () => {
    const acc = deriveAccount([sample({})], NOW, STALE, null);
    expect(acc?.billingMode).toBe("api");
  });

  it("null when there are no fresh samples and no API usage", () => {
    expect(deriveAccount([], NOW, STALE, null)).toBeNull();
    const stale = sample({ capturedMtimeMs: NOW - STALE - 1 });
    expect(deriveAccount([stale], NOW, STALE, null)).toBeNull();
  });

  it("extraUsage attaches from the API", () => {
    const acc = deriveAccount([], NOW, STALE, {
      extraUsage: { enabled: true, limit: 5000, used: 1200, utilization: 24 },
    });
    expect(acc?.extraUsage?.enabled).toBe(true);
    expect(acc?.extraUsage?.limit).toBe(5000);
  });

  it("version still comes from the freshest capture", () => {
    const older = sample({
      sessionId: "a",
      capturedMtimeMs: NOW - 2,
      version: "2.0.0",
    });
    const newer = sample({
      sessionId: "b",
      capturedMtimeMs: NOW - 1,
      version: "2.1.0",
    });
    expect(deriveAccount([older, newer], NOW, STALE, api)?.version).toBe(
      "2.1.0",
    );
  });
});

describe("overlaySessions rateLimits", () => {
  const base: Session = {
    id: "s1",
    title: "t",
    project: "p",
    state: "working",
    management: "managed",
    resumable: true,
    model: "opus",
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
    lastActivityMs: NOW,
    createdMs: NOW,
  };

  it("copies the sample's rateLimits onto the session verbatim", () => {
    const rl = { sevenDay: { usedPct: 22, resetsAt: NOW + 1 } };
    const byId = new Map([["s1", sample({ rateLimits: rl })]]);
    expect(overlaySessions([base], byId)[0].rateLimits).toEqual(rl);
  });

  it("absent when the capture carried none", () => {
    const byId = new Map([["s1", sample({ rateLimits: null })]]);
    expect(overlaySessions([base], byId)[0].rateLimits).toBeUndefined();
  });

  it("absent when the session has no capture", () => {
    expect(overlaySessions([base], new Map())[0].rateLimits).toBeUndefined();
  });

  it("A5: a capture-less clock keeps the transcript fallback; a capture clock wins", () => {
    const withFallback = { ...base, sessionClockMs: 60_000 };
    const noClockSample = sample({ sessionClockMs: null });
    expect(
      overlaySessions([withFallback], new Map([["s1", noClockSample]]))[0]
        .sessionClockMs,
    ).toBe(60_000);
    const clockSample = sample({ sessionClockMs: 99_000 });
    expect(
      overlaySessions([withFallback], new Map([["s1", clockSample]]))[0]
        .sessionClockMs,
    ).toBe(99_000);
  });
});
