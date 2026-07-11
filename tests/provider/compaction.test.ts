import { describe, expect, it } from "vitest";
import { parseTranscript } from "../../src/main/provider/claude/transcript";

const row = (o: object): string => JSON.stringify(o) + "\n";
const boundary = (over: object = {}): string =>
  row({ type: "system", subtype: "compact_boundary", ...over });

describe("compaction counter (A9, ccs compaction.ts:35-70)", () => {
  it("counts non-sidechain boundaries and sums max(0, pre−post)", () => {
    const jsonl =
      boundary({
        compactMetadata: { preTokens: 150_000, postTokens: 30_000 },
      }) +
      boundary({ compactMetadata: { preTokens: 10, postTokens: 50 } }) + // negative clamps to 0
      boundary({ isSidechain: true }) + // excluded
      boundary(); // absent metadata tolerated, still counts
    const s = parseTranscript(jsonl);
    expect(s.compactionCount).toBe(3);
    expect(s.compactionTokensReclaimed).toBe(120_000);
  });
  it("zero boundaries → zero count", () => {
    expect(parseTranscript("").compactionCount).toBe(0);
  });
});
