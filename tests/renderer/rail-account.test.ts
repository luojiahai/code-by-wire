import { describe, expect, it } from "vitest";
import { railAccountModel } from "../../src/renderer/src/ui/rail-account";
import type { Account } from "@shared/types";

// Fixed clock; resets are expressed as offsets from it so the countdown strings are deterministic.
const NOW = 1_700_000_000_000;
const in2h14m = NOW + (2 * 60 + 14) * 60_000;
const in5d = NOW + 5 * 24 * 60 * 60_000;

describe("railAccountModel — subscription", () => {
  it("returns null when there is no account", () => {
    expect(railAccountModel(null, NOW)).toBeNull();
  });

  it("returns null for an unknown account with no email and no windows", () => {
    expect(railAccountModel({ billingMode: "unknown" }, NOW)).toBeNull();
  });

  it("builds identity, plan label and 5h + weekly gauges", () => {
    const acc: Account = {
      billingMode: "subscription",
      email: "a@b.com",
      fiveHour: { usedPct: 42, resetsAt: in2h14m },
      sevenDay: { usedPct: 18, resetsAt: in5d },
    };
    expect(railAccountModel(acc, NOW)).toEqual({
      mode: "subscription",
      email: "a@b.com",
      plan: "Claude · subscription",
      gauges: [
        { label: "5h", pct: 42, reset: "resets in 2h 14m" },
        { label: "Weekly", pct: 18, reset: "resets in 5d" },
      ],
    });
  });

  it("appends Sonnet/Opus rows (percent only, no reset) when present", () => {
    const acc: Account = {
      billingMode: "subscription",
      email: "a@b.com",
      fiveHour: { usedPct: 42, resetsAt: in2h14m },
      sevenDay: { usedPct: 18, resetsAt: in5d },
      sevenDaySonnet: { usedPct: 22, resetsAt: in5d },
      sevenDayOpus: { usedPct: 61, resetsAt: in5d },
    };
    const view = railAccountModel(acc, NOW);
    expect(view).toMatchObject({
      mode: "subscription",
      gauges: [
        { label: "5h" },
        { label: "Weekly" },
        { label: "Sonnet", pct: 22, reset: null },
        { label: "Opus", pct: 61, reset: null },
      ],
    });
  });

  it("shows usage with no email (email null, gauges present)", () => {
    const acc: Account = {
      billingMode: "subscription",
      sevenDay: { usedPct: 5, resetsAt: in5d },
    };
    expect(railAccountModel(acc, NOW)).toMatchObject({
      mode: "subscription",
      email: null,
      gauges: [{ label: "Weekly" }],
    });
  });

  it("clamps and rounds the percent", () => {
    const acc: Account = {
      billingMode: "subscription",
      email: "a@b.com",
      fiveHour: { usedPct: 149.6, resetsAt: in2h14m },
      sevenDay: { usedPct: -3, resetsAt: in5d },
    };
    const view = railAccountModel(acc, NOW);
    expect(view).toMatchObject({ gauges: [{ pct: 100 }, { pct: 0 }] });
  });
});

describe("railAccountModel — api", () => {
  it("builds the api view from base URL and plan, ignoring auth and provider", () => {
    const acc: Account = {
      billingMode: "api",
      apiBaseUrl: "https://api.portkey.ai",
      apiAuthMethod: "token",
      apiProvider: "bedrock-use1-nonprod",
    };
    // auth method and provider are intentionally no longer surfaced in the rail
    expect(railAccountModel(acc, NOW)).toEqual({
      mode: "api",
      baseUrl: "api.portkey.ai",
      plan: "Claude · API",
    });
  });

  it("renders base URL and plan with no extra rows", () => {
    const acc: Account = {
      billingMode: "api",
      apiBaseUrl: "https://api.portkey.ai",
    };
    expect(railAccountModel(acc, NOW)).toEqual({
      mode: "api",
      baseUrl: "api.portkey.ai",
      plan: "Claude · API",
    });
  });

  it("returns null for api billing with no base URL configured", () => {
    expect(
      railAccountModel({ billingMode: "api", email: "a@b.com" }, NOW),
    ).toBeNull();
  });

  it("strips the scheme and a trailing slash, preserving host/port/path", () => {
    const host = (apiBaseUrl: string): string | undefined => {
      const v = railAccountModel({ billingMode: "api", apiBaseUrl }, NOW);
      return v && v.mode === "api" ? v.baseUrl : undefined;
    };
    expect(host("https://api.portkey.ai")).toBe("api.portkey.ai");
    expect(host("http://localhost:8080")).toBe("localhost:8080");
    expect(host("https://gw.example.com/v1/")).toBe("gw.example.com/v1");
    expect(host("api.direct.example")).toBe("api.direct.example");
  });
});

describe("railAccountModel — suppression", () => {
  it("returns null for an unknown account even with a stale email and windows", () => {
    // The Portkey/gateway case: billing inferred 'unknown' (no rate_limits captured), but a prior
    // subscription login left an oauthAccount email. Identity and windows are both subscription-only
    // (ADR-0001), so the block disappears rather than mislabel gateway billing.
    const acc: Account = {
      billingMode: "unknown",
      email: "a@b.com",
      fiveHour: { usedPct: 42, resetsAt: in2h14m },
      sevenDay: { usedPct: 18, resetsAt: in5d },
    };
    expect(railAccountModel(acc, NOW)).toBeNull();
  });
});
