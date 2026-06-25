import { describe, it, expect } from "vitest";
import { cacheCreationSplit } from "../../src/main/provider/claude/transcript-row";

describe("cacheCreationSplit", () => {
  it("parses both ephemeral buckets when the cache_creation sub-object is present", () => {
    const s = cacheCreationSplit({
      cache_creation_input_tokens: 37680,
      cache_creation: {
        ephemeral_5m_input_tokens: 30000,
        ephemeral_1h_input_tokens: 7680,
      },
    });
    expect(s).toEqual({ total: 37680, fiveM: 30000, oneH: 7680 });
    expect(s.fiveM + s.oneH).toBe(s.total); // invariant
  });

  it("attributes the whole total to 5m when the sub-object is absent (fallback invariant)", () => {
    const s = cacheCreationSplit({ cache_creation_input_tokens: 1234 });
    expect(s).toEqual({ total: 1234, fiveM: 1234, oneH: 0 });
    expect(s.fiveM + s.oneH).toBe(s.total);
  });

  it("is all-zero for a missing/blank usage block", () => {
    expect(cacheCreationSplit(undefined)).toEqual({
      total: 0,
      fiveM: 0,
      oneH: 0,
    });
    expect(cacheCreationSplit({})).toEqual({ total: 0, fiveM: 0, oneH: 0 });
  });
});
