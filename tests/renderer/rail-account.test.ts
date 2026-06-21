import { describe, expect, it } from "vitest";
import {
  maskEmail,
  railAccountModel,
} from "../../src/renderer/src/ui/rail-account";
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

  it("builds identity, plan label and 5h + 7d gauges", () => {
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
        { label: "5h", pct: 42, reset: "2h 14m" },
        { label: "7d", pct: 18, reset: "5d" },
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
      gauges: [{ label: "7d" }],
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
  it("names the upstream provider when a gateway has both a host and a provider", () => {
    const acc: Account = {
      billingMode: "api",
      apiBaseUrl: "https://api.portkey.ai",
      apiAuthMethod: "token",
      apiProvider: "openai-prod",
    };
    // auth method stays unrendered; provider now shows in the plan line
    expect(railAccountModel(acc, NOW)).toEqual({
      mode: "api",
      label: "api.portkey.ai",
      plan: "Claude · API · via openai-prod",
    });
  });

  it("renders a plain host with no via suffix when there's no provider", () => {
    const acc: Account = {
      billingMode: "api",
      apiBaseUrl: "https://api.portkey.ai",
    };
    expect(railAccountModel(acc, NOW)).toEqual({
      mode: "api",
      label: "api.portkey.ai",
      plan: "Claude · API",
    });
  });

  it("renders an Anthropic-direct account as the host with the plain plan", () => {
    const acc: Account = {
      billingMode: "api",
      apiBaseUrl: "https://api.anthropic.com",
      anthropicDirect: true,
    };
    expect(railAccountModel(acc, NOW)).toEqual({
      mode: "api",
      label: "api.anthropic.com",
      plan: "Claude · API",
    });
  });

  it.each([
    ["bedrock", "AWS Bedrock"],
    ["vertex", "Google Vertex"],
    ["foundry", "Microsoft Foundry"],
  ])(
    "renders the friendly name for the %s cloud provider",
    (provider, label) => {
      const acc: Account = { billingMode: "api", apiProvider: provider };
      expect(railAccountModel(acc, NOW)).toEqual({
        mode: "api",
        label,
        plan: "Claude · API",
      });
    },
  );

  it.each([
    ["mantle", "Mantle"],
    ["anthropic_aws", "Anthropic Aws"],
  ])("title-cases an uncurated cloud provider key (%s)", (provider, label) => {
    const acc: Account = { billingMode: "api", apiProvider: provider };
    expect(railAccountModel(acc, NOW)).toMatchObject({ mode: "api", label });
  });

  it("returns null for api billing with neither a host nor a provider", () => {
    expect(
      railAccountModel({ billingMode: "api", email: "a@b.com" }, NOW),
    ).toBeNull();
  });

  it("strips the scheme and a trailing slash, preserving host/port/path", () => {
    const label = (apiBaseUrl: string): string | undefined => {
      const v = railAccountModel({ billingMode: "api", apiBaseUrl }, NOW);
      return v && v.mode === "api" ? v.label : undefined;
    };
    expect(label("https://api.portkey.ai")).toBe("api.portkey.ai");
    expect(label("http://localhost:8080")).toBe("localhost:8080");
    expect(label("https://gw.example.com/v1/")).toBe("gw.example.com/v1");
    expect(label("api.direct.example")).toBe("api.direct.example");
    expect(label("HTTPS://api.portkey.ai")).toBe("api.portkey.ai");
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

describe("maskEmail", () => {
  it("shows the first 2 local chars, fixed bullets, and the full domain", () => {
    expect(maskEmail("ljiahai@hotmail.com")).toBe("lj••••@hotmail.com");
  });

  it("keeps the local part before the '+' for plus-addressing", () => {
    expect(maskEmail("geoff+tag@gmail.com")).toBe("ge••••@gmail.com");
  });

  it("reveals only one char when the local part is two chars", () => {
    expect(maskEmail("ab@x.io")).toBe("a••••@x.io");
  });

  it("reveals no local chars when the local part is one char", () => {
    expect(maskEmail("a@b.com")).toBe("••••@b.com");
  });

  it("preserves a multi-label domain in full", () => {
    expect(maskEmail("user@mail.corp.co.uk")).toBe("us••••@mail.corp.co.uk");
  });

  it("masks with no domain when there is no '@' (defensive)", () => {
    expect(maskEmail("weird")).toBe("we••••");
  });
});
