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
  apiDurationMs: null,
  pr: null,
  rateLimits: null,
  ...over,
});

const session = (over: Partial<Session> = {}): Session => ({
  id: "s1",
  title: "T",
  project: "p",
  state: "working",
  management: "observed",
  resumable: true,
  model: "opus",
  contextPct: 12,
  contextWindow: 1_000_000,
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  },
  lastActivityMs: NOW,
  createdMs: 0,
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

  it("returns api from a sample with no rate_limits — absence of rate_limits is not subscription evidence", () => {
    expect(
      deriveAccount([sample({ rateLimits: null })], NOW, STALE_MS),
    ).toEqual({ billingMode: "api" });
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

  it("a dormant subscriber (all windows expired) stays subscription — not downgraded to api or unknown", () => {
    // A subscription session from a while ago: its 5h and 7d windows have both passed their reset. The
    // capture is still within the staleness window but the rate_limits history is proof the account IS
    // a subscriber — just idle. It must stay subscription, not flip to api (which would mislabel cost).
    const s = sample({
      version: "2.0.14",
      rateLimits: {
        fiveHour: { usedPct: 80, resetsAt: NOW - 1 },
        sevenDay: { usedPct: 40, resetsAt: NOW - 1 },
      },
    });
    expect(deriveAccount([s], NOW, STALE_MS)).toEqual({
      billingMode: "subscription",
      fiveHour: undefined,
      sevenDay: undefined,
      version: "2.0.14",
    });
  });

  it("takes each window's highest used% across parallel sessions, not the newest file's (no flapping)", () => {
    // Three sessions in the SAME 5h window. The idle ones keep rewriting their captures (fresh
    // mtime) while carrying the % from their last API call (stale data) — here the stalest value
    // sits on the newest file. Usage only grows within a window, so every sample is a lower bound
    // and the max is the current account-wide estimate; picking by mtime flapped 45↔55↔63 between
    // polls as write order changed.
    const resetsAt = NOW + 3_600_000;
    const idle = sample({
      sessionId: "idle",
      capturedMtimeMs: NOW, // newest file…
      rateLimits: { fiveHour: { usedPct: 45, resetsAt } }, // …stalest data
    });
    const older = sample({
      sessionId: "older",
      capturedMtimeMs: NOW - 600_000,
      rateLimits: { fiveHour: { usedPct: 55, resetsAt } },
    });
    const active = sample({
      sessionId: "active",
      capturedMtimeMs: NOW - 2_000,
      rateLimits: { fiveHour: { usedPct: 63, resetsAt } },
    });
    expect(
      deriveAccount([idle, older, active], NOW, STALE_MS)?.fiveHour,
    ).toEqual({ usedPct: 63, resetsAt });
  });

  it("a newer reset window supersedes an older one, whatever its used%", () => {
    // Around a reset boundary both generations can be live for a moment (clock skew, a session that
    // hasn't called the API since the reset). The later resets_at is the current window; its low %
    // must win over the old generation's high one — max across generations would resurrect it.
    const oldGen = sample({
      sessionId: "a",
      capturedMtimeMs: NOW,
      rateLimits: { fiveHour: { usedPct: 90, resetsAt: NOW + 60_000 } },
    });
    const newGen = sample({
      sessionId: "b",
      capturedMtimeMs: NOW - 1_000,
      rateLimits: { fiveHour: { usedPct: 5, resetsAt: NOW + 5 * 3_600_000 } },
    });
    expect(deriveAccount([oldGen, newGen], NOW, STALE_MS)?.fiveHour).toEqual({
      usedPct: 5,
      resetsAt: NOW + 5 * 3_600_000,
    });
  });

  it("derives each window independently — one session's live 5h joins another's live weekly", () => {
    // The freshest-with-limits sample used to donate ALL windows; a session missing one window
    // blanked it even though a parallel session had it live.
    const fiveOnly = sample({
      sessionId: "a",
      capturedMtimeMs: NOW,
      rateLimits: { fiveHour: { usedPct: 40, resetsAt: NOW + 3_600_000 } },
    });
    const weeklyOnly = sample({
      sessionId: "b",
      capturedMtimeMs: NOW - 1_000,
      rateLimits: { sevenDay: { usedPct: 70, resetsAt: NOW + 86_400_000 } },
    });
    expect(deriveAccount([fiveOnly, weeklyOnly], NOW, STALE_MS)).toEqual({
      billingMode: "subscription",
      fiveHour: { usedPct: 40, resetsAt: NOW + 3_600_000 },
      sevenDay: { usedPct: 70, resetsAt: NOW + 86_400_000 },
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
  it("returns api when no capture carries rate_limits", () => {
    expect(
      deriveAccount([sample({ rateLimits: null })], NOW, STALE_MS),
    ).toEqual({ billingMode: "api" });
  });

  it("keeps subscription when a live window is present (subscription wins over api)", () => {
    const s = sample({
      rateLimits: { fiveHour: { usedPct: 20, resetsAt: NOW + 3_600_000 } },
    });
    expect(deriveAccount([s], NOW, STALE_MS)?.billingMode).toBe("subscription");
  });

  it("carries the CLI version onto an api account", () => {
    expect(
      deriveAccount(
        [sample({ rateLimits: null, version: "2.0.14" })],
        NOW,
        STALE_MS,
      ),
    ).toEqual({
      billingMode: "api",
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
    expect(out.linesAdded).toBe(156);
    expect(out.linesRemoved).toBe(23);
    expect(out.contextPct).toBe(64);
    expect(out.contextWindow).toBe(200_000);
  });

  it("leaves a Session WITHOUT a sample untouched — computed context % still shows (graceful degradation)", () => {
    const out = overlaySessions(
      [session({ id: "no-sample" })],
      freshestBySession([sample({ sessionId: "other" })]),
    );
    expect(out[0].contextPct).toBe(12); // computed, unchanged
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

  it("keeps the hydrated cwd when the sample lacks one", () => {
    const byId = new Map([["s1", sample({ cwd: null })]]);
    const [out] = overlaySessions([session({ cwd: "/work/app" })], byId);
    expect(out.cwd).toBe("/work/app");
  });

  it("prefers the live sample's cwd when present", () => {
    const byId = new Map([["s1", sample({ cwd: "/work/live" })]]);
    const [out] = overlaySessions([session({ cwd: "/work/app" })], byId);
    expect(out.cwd).toBe("/work/live");
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

describe("overlaySessions — cockpit fields", () => {
  it("copies costUsd, apiDurationMs, and pr from the sample", () => {
    const byId = freshestBySession([
      sample({
        costUsd: 170.37,
        apiDurationMs: 3_852_000,
        pr: { number: 252, url: "https://x/pull/252", reviewState: "pending" },
      }),
    ]);
    const [out] = overlaySessions([session()], byId);
    expect(out.costUsd).toBe(170.37);
    expect(out.apiDurationMs).toBe(3_852_000);
    expect(out.pr).toEqual({
      number: 252,
      url: "https://x/pull/252",
      reviewState: "pending",
    });
  });

  it("leaves them undefined when the sample omitted them", () => {
    const byId = freshestBySession([sample()]);
    const [out] = overlaySessions([session()], byId);
    expect(out.costUsd).toBeUndefined();
    expect(out.apiDurationMs).toBeUndefined();
    expect(out.pr).toBeUndefined();
  });

  it("leaves a sample-less session untouched", () => {
    const [out] = overlaySessions([session({ id: "other" })], new Map());
    expect(out.costUsd).toBeUndefined();
    expect(out.apiDurationMs).toBeUndefined();
    expect(out.pr).toBeUndefined();
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
