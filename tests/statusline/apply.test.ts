import { describe, it, expect } from "vitest";
import type { Session } from "@shared/types";
import {
  freshestBySession,
  deriveAccount,
  overlaySessions,
  type StatusLineSample,
} from "@shared/statusline";

const NOW = 1_781_000_000_000;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

const sample = (over: Partial<StatusLineSample> = {}): StatusLineSample => ({
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
  rateLimits: null,
  ...over,
});

const session = (over: Partial<Session> = {}): Session => ({
  id: "s1",
  title: "T",
  project: "p",
  state: "working",
  management: "observed",
  model: "claude-opus-4-8",
  contextPct: 12,
  contextWindow: 1_000_000,
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  },
  equivApiValueUsd: 3.5,
  lastActivityMs: NOW,
  ...over,
});

describe("deriveAccount", () => {
  it("reads a subscription from a sample carrying rate_limits, converting nothing further (already ms)", () => {
    const s = sample({
      rateLimits: {
        fiveHour: { usedPct: 23.5, resetsAt: NOW + 3_600_000 },
        sevenDay: { usedPct: 41, resetsAt: NOW + 86_400_000 },
      },
    });
    expect(deriveAccount([s], NOW, STALE_MS)).toEqual({
      billingMode: "subscription",
      fiveHour: { usedPct: 23.5, resetsAt: NOW + 3_600_000 },
      sevenDay: { usedPct: 41, resetsAt: NOW + 86_400_000 },
    });
  });

  it("returns unknown (never api) from a sample with no rate_limits — absence is not proof of API billing", () => {
    expect(
      deriveAccount([sample({ rateLimits: null })], NOW, STALE_MS),
    ).toEqual({ billingMode: "unknown" });
  });

  it("returns null when there is no statusLine data at all", () => {
    expect(deriveAccount([], NOW, STALE_MS)).toBeNull();
  });

  it("ignores a stale capture older than the window — a week-old sample cannot describe a 5h/7d limit", () => {
    const old = sample({
      capturedMtimeMs: NOW - STALE_MS - 1,
      rateLimits: { fiveHour: { usedPct: 9, resetsAt: NOW } },
    });
    expect(deriveAccount([old], NOW, STALE_MS)).toBeNull();
  });

  it("picks the freshest sample when several disagree", () => {
    const stale = sample({
      sessionId: "a",
      capturedMtimeMs: NOW - 10_000,
      rateLimits: null,
    });
    const fresh = sample({
      sessionId: "b",
      capturedMtimeMs: NOW,
      rateLimits: { fiveHour: { usedPct: 50, resetsAt: NOW + 1000 } },
    });
    expect(deriveAccount([stale, fresh], NOW, STALE_MS)?.billingMode).toBe(
      "subscription",
    );
  });

  it("prefers the freshest capture carrying rate_limits, so a newer no-limits capture does not flip to api", () => {
    // A subscription session that hasn't had its first API response yet (no rate_limits) writes the
    // newest capture, while an older session still carries the windows. The account must stay subscription.
    const older = sample({
      sessionId: "a",
      capturedMtimeMs: NOW - 1000,
      rateLimits: { fiveHour: { usedPct: 30, resetsAt: NOW + 3_600_000 } },
    });
    const newer = sample({
      sessionId: "b",
      capturedMtimeMs: NOW,
      rateLimits: null,
    });
    expect(deriveAccount([newer, older], NOW, STALE_MS)).toEqual({
      billingMode: "subscription",
      fiveHour: { usedPct: 30, resetsAt: NOW + 3_600_000 },
      sevenDay: undefined,
    });
  });

  it('drops a rate-limit window whose reset has already passed (no stale "% used · resets now")', () => {
    const s = sample({
      rateLimits: {
        fiveHour: { usedPct: 80, resetsAt: NOW - 1 },
        sevenDay: { usedPct: 40, resetsAt: NOW + 86_400_000 },
      },
    });
    expect(deriveAccount([s], NOW, STALE_MS)).toEqual({
      billingMode: "subscription",
      fiveHour: undefined, // already reset → not shown stale
      sevenDay: { usedPct: 40, resetsAt: NOW + 86_400_000 },
    });
  });

  it("falls back to unknown when every window has expired — stale limits are not proof of a current subscription", () => {
    // A subscription session from a while ago: its 5h and 7d windows have both passed their reset. The
    // capture is still within the staleness window but no longer evidences a live subscription, so the
    // account must not keep the 'subscription' label (e.g. after the user switched to API/gateway billing).
    const s = sample({
      version: "2.0.14",
      rateLimits: {
        fiveHour: { usedPct: 80, resetsAt: NOW - 1 },
        sevenDay: { usedPct: 40, resetsAt: NOW - 1 },
      },
    });
    expect(deriveAccount([s], NOW, STALE_MS)).toEqual({
      billingMode: "unknown",
      version: "2.0.14",
    });
  });

  it("stays subscription on a lone live per-model window — any one live window is proof enough", () => {
    // The 5h and weekly windows have both reset, but the per-model Opus bucket is still live. A single
    // live window keeps the account 'subscription'; this exercises the sevenDayOpus term of the OR that
    // a fiveHour/sevenDay-only test would leave unchecked.
    const s = sample({
      rateLimits: {
        fiveHour: { usedPct: 80, resetsAt: NOW - 1 },
        sevenDay: { usedPct: 40, resetsAt: NOW - 1 },
        sevenDayOpus: { usedPct: 55, resetsAt: NOW + 86_400_000 },
      },
    });
    expect(deriveAccount([s], NOW, STALE_MS)).toEqual({
      billingMode: "subscription",
      fiveHour: undefined, // reset → dropped
      sevenDay: undefined, // reset → dropped
      sevenDaySonnet: undefined,
      sevenDayOpus: { usedPct: 55, resetsAt: NOW + 86_400_000 },
    });
  });
});

describe("deriveAccount — api billing", () => {
  it("promotes to api when no capture carries rate_limits and a base URL is configured", () => {
    const api = {
      baseUrl: "https://api.portkey.ai",
      authMethod: "token" as const,
      provider: "bedrock-use1-nonprod",
    };
    expect(
      deriveAccount([sample({ rateLimits: null })], NOW, STALE_MS, api),
    ).toEqual({
      billingMode: "api",
      apiBaseUrl: "https://api.portkey.ai",
      apiAuthMethod: "token",
      apiProvider: "bedrock-use1-nonprod",
    });
  });

  it("does NOT relabel a dormant subscriber as api: a capture that carried rate_limits (all expired) stays unknown", () => {
    // The mixed Opus-subscription + gateway case. The freshest with-limits capture has every window past
    // its reset, so it is not a *live* subscription — but the rate_limits history proves the account IS a
    // subscriber, just idle. Relabeling it API billing would wrongly flip the cost label to 'Actual API spend'.
    const s = sample({
      rateLimits: {
        fiveHour: { usedPct: 80, resetsAt: NOW - 1 },
        sevenDay: { usedPct: 40, resetsAt: NOW - 1 },
      },
    });
    expect(
      deriveAccount([s], NOW, STALE_MS, { baseUrl: "https://api.portkey.ai" }),
    ).toEqual({ billingMode: "unknown" });
  });

  it("keeps subscription over api when a window is live and a base URL is also configured (subscription wins)", () => {
    const s = sample({
      rateLimits: { fiveHour: { usedPct: 20, resetsAt: NOW + 3_600_000 } },
    });
    expect(
      deriveAccount([s], NOW, STALE_MS, { baseUrl: "https://api.portkey.ai" })
        ?.billingMode,
    ).toBe("subscription");
  });

  it("carries the CLI version onto a promoted api account, like the unknown fallback does", () => {
    const api = { baseUrl: "https://api.portkey.ai" };
    expect(
      deriveAccount(
        [sample({ rateLimits: null, version: "2.0.14" })],
        NOW,
        STALE_MS,
        api,
      ),
    ).toEqual({
      billingMode: "api",
      apiBaseUrl: "https://api.portkey.ai",
      version: "2.0.14",
    });
  });
});

describe("overlaySessions", () => {
  it("overlays live cost, lines, and context onto a Session that has a sample", () => {
    const byId = freshestBySession([
      sample({
        sessionId: "s1",
        costUsd: 0.42,
        linesAdded: 156,
        linesRemoved: 23,
        contextPct: 64,
        contextWindow: 200_000,
      }),
    ]);
    const [out] = overlaySessions([session()], byId);
    expect(out.liveCostUsd).toBe(0.42);
    expect(out.linesAdded).toBe(156);
    expect(out.linesRemoved).toBe(23);
    expect(out.contextPct).toBe(64);
    expect(out.contextWindow).toBe(200_000);
  });

  it("leaves a Session WITHOUT a sample untouched — computed context % and value still show (graceful degradation, ADR-0001)", () => {
    const out = overlaySessions(
      [session({ id: "no-sample" })],
      freshestBySession([sample({ sessionId: "other" })]),
    );
    expect(out[0].contextPct).toBe(12); // computed, unchanged
    expect(out[0].equivApiValueUsd).toBe(3.5); // computed, unchanged
    expect(out[0].liveCostUsd).toBeUndefined();
    expect(out[0].linesAdded).toBeUndefined();
  });

  it("falls back to the computed context % when the sample omitted used_percentage and carried no live split", () => {
    const byId = freshestBySession([
      sample({ sessionId: "s1", contextPct: null, costUsd: 1 }),
    ]);
    expect(
      overlaySessions([session({ contextPct: 12 })], byId)[0].contextPct,
    ).toBe(12);
  });

  it("derives the context % from the live split over the window when the capture omitted used_percentage", () => {
    // A capture with current_usage but no used_percentage: fill from the exact live tokens, never the
    // stale transcript % — the Context panel shows the live total/window beside this number.
    const byId = freshestBySession([
      sample({
        sessionId: "s1",
        contextPct: null,
        contextWindow: 200_000,
        liveContext: { input: 0, cacheRead: 100_000, cacheCreation: 0 },
      }),
    ]);
    expect(
      overlaySessions([session({ contextPct: 12 })], byId)[0].contextPct,
    ).toBe(50); // 100000 / 200000
  });

  it('keeps a zero live cost (0 is a real value, not "missing")', () => {
    const byId = freshestBySession([sample({ sessionId: "s1", costUsd: 0 })]);
    expect(overlaySessions([session()], byId)[0].liveCostUsd).toBe(0);
  });

  it("overlays the live context split and model identity onto a Session with a sample", () => {
    const byId = freshestBySession([
      sample({
        sessionId: "s1",
        liveContext: { input: 2, cacheRead: 203_420, cacheCreation: 2770 },
        modelId: "claude-opus-4-8[1m]",
        modelDisplayName: "Opus 4.8 (1M context)",
      }),
    ]);
    const [out] = overlaySessions([session()], byId);
    expect(out.liveContext).toEqual({
      input: 2,
      cacheRead: 203_420,
      cacheCreation: 2770,
    });
    expect(out.modelId).toBe("claude-opus-4-8[1m]");
    expect(out.modelDisplayName).toBe("Opus 4.8 (1M context)");
  });

  it("leaves the live fields undefined for a Session without a sample", () => {
    const out = overlaySessions(
      [session({ id: "no-sample" })],
      freshestBySession([sample({ sessionId: "other" })]),
    );
    expect(out[0].liveContext).toBeUndefined();
    expect(out[0].modelId).toBeUndefined();
    expect(out[0].modelDisplayName).toBeUndefined();
  });

  it("prefers the capture session_name as the title", () => {
    const byId = freshestBySession([
      sample({ sessionId: "s1", sessionName: "Code review approval" }),
    ]);
    expect(
      overlaySessions([session({ title: "first prompt title" })], byId)[0]
        .title,
    ).toBe("Code review approval");
  });

  it("keeps the computed title when the capture has no session_name", () => {
    const byId = freshestBySession([
      sample({ sessionId: "s1", sessionName: null }),
    ]);
    expect(
      overlaySessions([session({ title: "first prompt title" })], byId)[0]
        .title,
    ).toBe("first prompt title");
  });
});

describe("overlaySessions — effort, clock, cwd", () => {
  it("overlays the new core fields from the sample", () => {
    const byId = new Map([
      [
        "s1",
        sample({
          effortLevel: "high",
          sessionClockMs: 6_120_000,
          cwd: "/Users/me/proj",
        }),
      ],
    ]);
    const [s] = overlaySessions([session({ id: "s1" })], byId);
    expect(s.effortLevel).toBe("high");
    expect(s.sessionClockMs).toBe(6_120_000);
    expect(s.cwd).toBe("/Users/me/proj");
  });

  it("leaves a session with no sample untouched (no new fields)", () => {
    const [s] = overlaySessions([session({ id: "s1" })], new Map());
    expect(s.effortLevel).toBeUndefined();
    expect(s.sessionClockMs).toBeUndefined();
    expect(s.cwd).toBeUndefined();
  });
});

describe("freshestBySession", () => {
  it("keeps the newest capture per session id", () => {
    const a = sample({ sessionId: "s1", capturedMtimeMs: 100, costUsd: 1 });
    const b = sample({ sessionId: "s1", capturedMtimeMs: 200, costUsd: 2 });
    expect(freshestBySession([a, b]).get("s1")?.costUsd).toBe(2);
  });

  it("keeps every distinct session id", () => {
    const map = freshestBySession([
      sample({ sessionId: "a" }),
      sample({ sessionId: "b" }),
    ]);
    expect([...map.keys()].sort()).toEqual(["a", "b"]);
  });
});
