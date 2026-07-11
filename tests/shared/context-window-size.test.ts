import { describe, expect, it } from "vitest";
import { parseContextWindowSize } from "@shared/models";

describe("parseContextWindowSize (A1, ccs model-context.ts:38-70)", () => {
  it("delimited forms", () => {
    expect(parseContextWindowSize("claude-opus-4-8 (1M)")).toBe(1_000_000);
    expect(parseContextWindowSize("claude-opus-4-8[1m]")).toBe(1_000_000);
    expect(parseContextWindowSize("claude-sonnet-5 [200k]")).toBe(200_000);
  });
  it("bare forms", () => {
    expect(parseContextWindowSize("Opus 1M context")).toBe(1_000_000);
    expect(parseContextWindowSize("something 200k")).toBe(200_000);
  });
  it("comma/underscore separators inside the number", () => {
    expect(parseContextWindowSize("model (1,000k)")).toBe(1_000_000);
    expect(parseContextWindowSize("model [1_000k]")).toBe(1_000_000);
  });
  it("first candidate with a size wins; later candidates fill", () => {
    expect(parseContextWindowSize("claude-opus-4-8", "Opus (1M)")).toBe(
      1_000_000,
    );
  });
  it("garbage and absent → null", () => {
    expect(parseContextWindowSize("claude-opus-4-8")).toBeNull();
    expect(parseContextWindowSize(undefined, null, "")).toBeNull();
    expect(parseContextWindowSize()).toBeNull();
  });
});
