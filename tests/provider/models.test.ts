import { describe, it, expect } from "vitest";
import {
  normalizeModelId,
  isKnownModelString,
  contextWindowFor,
} from "@shared/models";

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
