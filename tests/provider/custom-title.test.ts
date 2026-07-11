import { describe, expect, it } from "vitest";
import { parseTranscript } from "../../src/main/provider/claude/transcript";

const row = (o: object): string => JSON.stringify(o) + "\n";
const prompt = row({
  type: "user",
  timestamp: "2026-07-10T00:00:00Z",
  message: { content: "fix the flaky test" },
});

describe("transcript custom-title tier (A7, ccs SessionName.ts:25-52)", () => {
  it("custom-title beats the first user prompt; newest custom-title wins", () => {
    const jsonl =
      prompt +
      row({ type: "custom-title", customTitle: "old name" }) +
      row({ type: "custom-title", customTitle: "new name" });
    expect(parseTranscript(jsonl).title).toBe("new name");
  });
  it("blank custom-title is ignored", () => {
    const jsonl = prompt + row({ type: "custom-title", customTitle: "   " });
    expect(parseTranscript(jsonl).title).toBe("fix the flaky test");
  });
});
