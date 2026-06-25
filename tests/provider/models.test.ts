import { describe, it, expect } from "vitest";
import {
  normalizeModelId,
  isKnownModelString,
  contextWindowFor,
  priceFor,
  equivApiValue,
  costBreakdown,
  resolvePricing,
} from "@shared/models";
import type { Usage } from "@shared/types";

describe("normalizeModelId", () => {
  it("maps known model strings to their family alias by substring", () => {
    expect(normalizeModelId("claude-opus-4-8")).toBe("opus");
    expect(normalizeModelId("claude-sonnet-4-6")).toBe("sonnet");
    expect(normalizeModelId("claude-haiku-4-5")).toBe("haiku");
  });

  it("matches by family across suffixes (date stamps, [1m]) and defaults unknowns to opus", () => {
    expect(normalizeModelId("claude-opus-4-8[1m]")).toBe("opus");
    expect(normalizeModelId("claude-haiku-4-5-20251001")).toBe("haiku");
    expect(normalizeModelId(undefined)).toBe("opus");
    expect(normalizeModelId("something-weird")).toBe("opus");
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
    expect(contextWindowFor("opus")).toBe(200_000);
    expect(contextWindowFor("sonnet")).toBe(200_000);
    expect(contextWindowFor("haiku")).toBe(200_000);
  });
});

describe("priceFor", () => {
  it("distinguishes input / output / cache-read / 5m & 1h cache-write rates per model", () => {
    expect(priceFor("opus")).toEqual({
      input: 5,
      output: 25,
      cacheRead: 0.5,
      cacheWrite5m: 6.25,
      cacheWrite1h: 10,
    });
    expect(priceFor("sonnet")).toEqual({
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite5m: 3.75,
      cacheWrite1h: 6,
    });
    expect(priceFor("haiku")).toEqual({
      input: 1,
      output: 5,
      cacheRead: 0.1,
      cacheWrite5m: 1.25,
      cacheWrite1h: 2,
    });
  });
});

describe("equivApiValue", () => {
  const usage = (over: Partial<Usage> = {}): Usage => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
    ...over,
  });

  it("is zero with no tokens", () => {
    expect(equivApiValue(usage(), "opus")).toBe(0);
  });

  it("prices each token kind at its per-million rate and sums them", () => {
    // 1M input at opus $5/M = $5; 1M cache-read at $0.50/M = $0.50.
    expect(
      equivApiValue(usage({ inputTokens: 1_000_000 }), "opus"),
    ).toBeCloseTo(5);
    expect(
      equivApiValue(usage({ cacheReadTokens: 1_000_000 }), "opus"),
    ).toBeCloseTo(0.5);

    // Mixed, opus: 100k in, 20k out, 400k cache-read, 10k cache-write (all at 5m rate).
    // (100000*5 + 20000*25 + 400000*0.5 + 10000*6.25) / 1e6 = 1.2625
    const mixed = usage({
      inputTokens: 100_000,
      outputTokens: 20_000,
      cacheReadTokens: 400_000,
      cacheCreationTokens: 10_000,
      cacheCreation5mTokens: 10_000,
    });
    expect(equivApiValue(mixed, "opus")).toBeCloseTo(1.2625);
  });
});

describe("costBreakdown", () => {
  const usage = (over: Partial<Usage> = {}): Usage => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
    ...over,
  });

  it("is all zero with no tokens", () => {
    expect(costBreakdown(usage(), "opus")).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      cacheWrite: 0,
      total: 0,
      cacheSavings: 0,
    });
  });

  it("reports cache-hit savings as the read discount vs full input price", () => {
    const b = costBreakdown(usage({ cacheReadTokens: 1_000_000 }), "opus");
    expect(b.cacheSavings).toBeCloseTo(4.5); // paid $0.50, fresh $5.00 → saved $4.50
  });
});

describe("resolvePricing", () => {
  it("returns the family defaults when there are no overrides", () => {
    expect(resolvePricing("opus")).toEqual(priceFor("opus"));
    expect(resolvePricing("opus", {})).toEqual(priceFor("opus"));
  });
  it("merges a per-field override over the defaults, leaving the rest intact", () => {
    const r = resolvePricing("opus", { opus: { cacheWrite1h: 99 } });
    expect(r.cacheWrite1h).toBe(99);
    expect(r.input).toBe(5); // untouched field keeps the default
    expect(r.cacheWrite5m).toBe(6.25);
  });
  it("does not let one family's override leak into another", () => {
    const o = { opus: { input: 1 } };
    expect(resolvePricing("sonnet", o)).toEqual(priceFor("sonnet"));
  });
});
