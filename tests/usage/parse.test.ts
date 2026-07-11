import { describe, expect, it } from "vitest";
import { parseUsageResponse } from "../../src/main/usage/parse";

const RESET_ISO = "2026-07-14T00:00:00Z";
const RESET_MS = Date.parse(RESET_ISO);

describe("parseUsageResponse", () => {
  it("maps the four buckets, ISO resets_at → epoch ms", () => {
    const u = parseUsageResponse({
      five_hour: { utilization: 12, resets_at: RESET_ISO },
      seven_day: { utilization: 22.4, resets_at: RESET_ISO },
      seven_day_sonnet: { utilization: 5, resets_at: RESET_ISO },
      seven_day_opus: { utilization: 7, resets_at: RESET_ISO },
    });
    expect(u?.fiveHour).toEqual({ usedPct: 12, resetsAt: RESET_MS });
    // float utilization passes through untouched; the renderer rounds
    expect(u?.sevenDay).toEqual({ usedPct: 22.4, resetsAt: RESET_MS });
    expect(u?.sevenDaySonnet?.usedPct).toBe(5);
    expect(u?.sevenDayOpus?.usedPct).toBe(7);
  });

  it("a null (Enterprise) bucket → window absent", () => {
    const u = parseUsageResponse({
      five_hour: null,
      seven_day: { utilization: 1, resets_at: RESET_ISO },
    });
    expect(u?.fiveHour).toBeUndefined();
    expect(u?.sevenDay).toBeDefined();
  });

  it("buckets degrade independently on malformed fields", () => {
    const u = parseUsageResponse({
      five_hour: { utilization: "12", resets_at: RESET_ISO }, // string utilization → absent
      seven_day: { utilization: 22, resets_at: "not a date" }, // bad date → absent
      seven_day_sonnet: { utilization: 5, resets_at: RESET_ISO },
    });
    expect(u?.fiveHour).toBeUndefined();
    expect(u?.sevenDay).toBeUndefined();
    expect(u?.sevenDaySonnet).toBeDefined();
  });

  it("extra_usage maps when is_enabled is boolean; fields degrade independently", () => {
    const u = parseUsageResponse({
      extra_usage: {
        is_enabled: true,
        monthly_limit: 5000,
        used_credits: 1234,
        utilization: 24.7,
        currency: "USD",
      },
    });
    expect(u?.extraUsage).toEqual({
      enabled: true,
      limit: 5000,
      used: 1234,
      utilization: 24.7,
      currency: "USD",
    });
    const partial = parseUsageResponse({
      extra_usage: { is_enabled: false, monthly_limit: "x" },
    });
    expect(partial?.extraUsage).toEqual({ enabled: false });
    // non-boolean is_enabled → extra_usage absent entirely
    expect(
      parseUsageResponse({ extra_usage: { is_enabled: "yes" } })?.extraUsage,
    ).toBeUndefined();
  });

  it("an all-absent response is still truthy (subscription evidence, dashed rows)", () => {
    const u = parseUsageResponse({});
    expect(u).not.toBeNull();
    expect(u?.fiveHour).toBeUndefined();
  });

  it("a non-object body is a parse failure", () => {
    expect(parseUsageResponse(null)).toBeNull();
    expect(parseUsageResponse("nope")).toBeNull();
  });
});
