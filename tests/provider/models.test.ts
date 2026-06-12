import { describe, it, expect } from "vitest";
import {
  normalizeModelId,
  isKnownModelString,
  contextWindowFor,
  priceFor,
  equivApiValue,
  costBreakdown,
} from "@shared/models";
import type { Usage } from "@shared/types";

describe("normalizeModelId", () => {
  it("maps known model strings to canonical ids", () => {
    expect(normalizeModelId("claude-opus-4-8")).toBe("claude-opus-4-8");
    expect(normalizeModelId("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(normalizeModelId("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  it("matches by family across suffixes (date stamps, [1m]) and defaults unknowns to opus", () => {
    expect(normalizeModelId("claude-opus-4-8[1m]")).toBe("claude-opus-4-8");
    expect(normalizeModelId("claude-haiku-4-5-20251001")).toBe(
      "claude-haiku-4-5",
    );
    expect(normalizeModelId(undefined)).toBe("claude-opus-4-8");
    expect(normalizeModelId("something-weird")).toBe("claude-opus-4-8");
  });
});

describe("isKnownModelString", () => {
  it("is true for a string matching a known family (incl. suffixes), false for an unknown family", () => {
    expect(isKnownModelString("claude-opus-4-8[1m]")).toBe(true);
    expect(isKnownModelString("claude-sonnet-4-6-20251015")).toBe(true);
    expect(isKnownModelString("claude-neo-1")).toBe(false); // no known family substring
    expect(isKnownModelString("gpt-5-codex")).toBe(false);
    expect(isKnownModelString(undefined)).toBe(false);
  });
});

describe("contextWindowFor", () => {
  it("defaults every family to the standard 200K window (the real default; [1m] is a launch override)", () => {
    expect(contextWindowFor("claude-opus-4-8")).toBe(200_000);
    expect(contextWindowFor("claude-sonnet-4-6")).toBe(200_000);
    expect(contextWindowFor("claude-haiku-4-5")).toBe(200_000);
  });
});

describe("priceFor", () => {
  it("distinguishes input / output / cache-read / cache-write rates per model", () => {
    expect(priceFor("claude-opus-4-8")).toEqual({
      input: 5,
      output: 25,
      cacheRead: 0.5,
      cacheWrite: 6.25,
    });
    expect(priceFor("claude-sonnet-4-6")).toEqual({
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    });
    expect(priceFor("claude-haiku-4-5")).toEqual({
      input: 1,
      output: 5,
      cacheRead: 0.1,
      cacheWrite: 1.25,
    });
  });
});

describe("equivApiValue", () => {
  const usage = (over: Partial<Usage> = {}): Usage => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    ...over,
  });

  it("is zero with no tokens", () => {
    expect(equivApiValue(usage(), "claude-opus-4-8")).toBe(0);
  });

  it("prices each token kind at its per-million rate and sums them", () => {
    // 1M input at opus $5/M = $5; 1M cache-read at $0.50/M = $0.50.
    expect(
      equivApiValue(usage({ inputTokens: 1_000_000 }), "claude-opus-4-8"),
    ).toBeCloseTo(5);
    expect(
      equivApiValue(usage({ cacheReadTokens: 1_000_000 }), "claude-opus-4-8"),
    ).toBeCloseTo(0.5);

    // Mixed, opus: 100k in, 20k out, 400k cache-read, 10k cache-write.
    // (100000*5 + 20000*25 + 400000*0.5 + 10000*6.25) / 1e6 = 1.2625
    const mixed = usage({
      inputTokens: 100_000,
      outputTokens: 20_000,
      cacheReadTokens: 400_000,
      cacheCreationTokens: 10_000,
    });
    expect(equivApiValue(mixed, "claude-opus-4-8")).toBeCloseTo(1.2625);
  });
});

describe("costBreakdown", () => {
  const usage = (over: Partial<Usage> = {}): Usage => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    ...over,
  });

  it("is all zero with no tokens", () => {
    expect(costBreakdown(usage(), "claude-opus-4-8")).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
      cacheSavings: 0,
    });
  });

  it("prices each kind at its per-million rate and sums to the equivalent value", () => {
    const mixed = usage({
      inputTokens: 100_000,
      outputTokens: 20_000,
      cacheReadTokens: 400_000,
      cacheCreationTokens: 10_000,
    });
    const b = costBreakdown(mixed, "claude-opus-4-8");
    expect(b.input).toBeCloseTo(0.5); // 100k × $5/M
    expect(b.output).toBeCloseTo(0.5); // 20k × $25/M
    expect(b.cacheRead).toBeCloseTo(0.2); // 400k × $0.5/M
    expect(b.cacheWrite).toBeCloseTo(0.0625); // 10k × $6.25/M
    expect(b.total).toBeCloseTo(1.2625);
    expect(b.total).toBeCloseTo(equivApiValue(mixed, "claude-opus-4-8"));
  });

  it("reports cache-hit savings as the read discount vs full input price", () => {
    // 1M cache-read on opus: paid $0.50, would have been $5.00 fresh → saved $4.50.
    const b = costBreakdown(
      usage({ cacheReadTokens: 1_000_000 }),
      "claude-opus-4-8",
    );
    expect(b.cacheSavings).toBeCloseTo(4.5);
  });
});
