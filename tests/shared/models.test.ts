import { describe, it, expect } from "vitest";
import {
  FAMILIES,
  normalizeModelId,
  isKnownModelString,
  priceFor,
  type Family,
} from "../../src/shared/models";

describe("FAMILIES", () => {
  it("is the four aliases claude --model accepts", () => {
    expect(FAMILIES).toEqual(["opus", "sonnet", "haiku", "fable"]);
  });
});

describe("normalizeModelId", () => {
  it("maps a pinned id to its family by substring", () => {
    expect(normalizeModelId("claude-opus-4-8")).toBe<Family>("opus");
    expect(normalizeModelId("claude-sonnet-4-6")).toBe<Family>("sonnet");
  });
  it("maps Claude Fable 5 to the fable family", () => {
    expect(normalizeModelId("claude-fable-5")).toBe<Family>("fable");
  });
  it("maps a provider-prefixed id by substring", () => {
    expect(normalizeModelId("global.anthropic.claude-opus-4-7")).toBe<Family>(
      "opus",
    );
  });
  it("falls back to opus (the neutral default) for an unrecognized string", () => {
    expect(normalizeModelId("claude-neo-1")).toBe<Family>("opus");
    expect(normalizeModelId(undefined)).toBe<Family>("opus");
  });
});

describe("isKnownModelString", () => {
  it("is false for a string matching no family", () => {
    expect(isKnownModelString("claude-neo-1")).toBe(false);
    expect(isKnownModelString(undefined)).toBe(false);
  });
  it("is true for a recognized family substring", () => {
    expect(isKnownModelString("claude-fable-5")).toBe(true);
  });
});

describe("priceFor", () => {
  it("prices Fable at its own rates, not the Opus fallback", () => {
    expect(priceFor("fable")).toEqual({
      input: 10,
      output: 50,
      cacheRead: 1,
      cacheWrite: 12.5,
    });
  });
});
