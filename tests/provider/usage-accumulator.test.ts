import { describe, it, expect } from "vitest";
import {
  UsageAccumulator,
  readUsage,
} from "../../src/main/provider/claude/usage-accumulator";

const usage = (out: number, over: Record<string, unknown> = {}) => ({
  input_tokens: 7,
  output_tokens: out,
  cache_read_input_tokens: 3,
  cache_creation_input_tokens: 2,
  ...over,
});

describe("readUsage", () => {
  it("projects a raw usage block into the Usage shape with the cache split", () => {
    expect(
      readUsage(
        usage(10, {
          cache_creation_input_tokens: 100,
          cache_creation: {
            ephemeral_5m_input_tokens: 60,
            ephemeral_1h_input_tokens: 40,
          },
        }),
      ),
    ).toEqual({
      inputTokens: 7,
      outputTokens: 10,
      cacheReadTokens: 3,
      cacheCreationTokens: 100,
      cacheCreation5mTokens: 60,
      cacheCreation1hTokens: 40,
    });
  });

  it("coerces a malformed block to zeros", () => {
    expect(readUsage(null).outputTokens).toBe(0);
    expect(readUsage({ output_tokens: "nope" }).outputTokens).toBe(0);
  });
});

describe("UsageAccumulator", () => {
  it("keeps the LAST snapshot for a repeated key (progressive streaming usage)", () => {
    // Subagent transcripts write cumulative snapshots: [0, 0, 764]. Only the last is billed.
    const acc = new UsageAccumulator();
    acc.add("m1", usage(0));
    acc.add("m1", usage(0));
    acc.add("m1", usage(764));
    expect(acc.totals().outputTokens).toBe(764);
    expect(acc.entries()).toHaveLength(1);
  });

  it("counts every null-key (id-less) block separately", () => {
    const acc = new UsageAccumulator();
    acc.add(null, usage(1));
    acc.add(null, usage(2));
    expect(acc.totals().outputTokens).toBe(3);
    expect(acc.entries()).toHaveLength(2);
  });

  it("captures makeValue on first sight only and keeps it across re-adds", () => {
    const acc = new UsageAccumulator<string>();
    acc.add("m1", usage(0), () => "first");
    acc.add("m1", usage(9), () => "second");
    const [e] = acc.entries();
    expect(e.value).toBe("first");
    expect(e.usage.outputTokens).toBe(9);
  });

  it("sums distinct keys field by field", () => {
    const acc = new UsageAccumulator();
    acc.add("a", usage(10));
    acc.add("b", usage(20));
    expect(acc.totals()).toEqual({
      inputTokens: 14,
      outputTokens: 30,
      cacheReadTokens: 6,
      cacheCreationTokens: 4,
      cacheCreation5mTokens: 4,
      cacheCreation1hTokens: 0,
    });
    expect(acc.has("a")).toBe(true);
    expect(acc.has("zzz")).toBe(false);
  });
});
