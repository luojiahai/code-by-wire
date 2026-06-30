import { describe, it, expect } from "vitest";
import { usage } from "../helpers/usage";
import {
  sumUsages,
  tokenTotal,
  viewUsageByModel,
} from "../../src/shared/usage-by-model";

describe("sumUsages / tokenTotal", () => {
  it("sums field by field and totals all four kinds", () => {
    const a = usage({
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheCreationTokens: 4,
    });
    const b = usage({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheCreationTokens: 40,
    });
    const s = sumUsages([a, b]);
    expect(s.inputTokens).toBe(11);
    expect(s.outputTokens).toBe(22);
    expect(s.cacheReadTokens).toBe(33);
    expect(s.cacheCreationTokens).toBe(44);
    expect(tokenTotal(s)).toBe(11 + 22 + 33 + 44);
  });
});

describe("viewUsageByModel", () => {
  it("is all-zero for an empty breakdown", () => {
    const v = viewUsageByModel([]);
    expect(v.totalTokens).toBe(0);
    expect(v.models).toEqual([]);
  });

  it("combines tokens across models, sorted biggest first", () => {
    const v = viewUsageByModel([
      {
        modelRaw: "claude-sonnet-4-6",
        usage: usage({ inputTokens: 1_000_000 }),
      },
      { modelRaw: "claude-opus-4-8", usage: usage({ inputTokens: 2_000_000 }) },
    ]);
    // Combined input tokens across both models.
    expect(v.usage.inputTokens).toBe(3_000_000);
    expect(v.totalTokens).toBe(3_000_000);
    // Opus has more tokens, sorts first.
    expect(v.models[0].modelRaw).toBe("claude-opus-4-8");
  });

  it("counts an unrecognized model's tokens", () => {
    const v = viewUsageByModel([
      { modelRaw: "claude-opus-4-8", usage: usage({ inputTokens: 1_000_000 }) },
      { modelRaw: "gpt-5", usage: usage({ inputTokens: 1_000_000 }) },
    ]);
    expect(v.usage.inputTokens).toBe(2_000_000); // tokens still combine
    const unknown = v.models.find((m) => m.modelRaw === "gpt-5");
    expect(unknown!.totalTokens).toBe(1_000_000);
  });
});
