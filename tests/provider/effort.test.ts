import { describe, expect, it } from "vitest";
import { parseTranscript } from "../../src/main/provider/claude/transcript";

const row = (o: object): string => JSON.stringify(o) + "\n";
const stdout = (text: string): string =>
  row({
    type: "user",
    isMeta: true,
    timestamp: "2026-07-10T00:00:01Z",
    message: { content: text },
  });

describe("transcript effort scan (A6, ccs jsonl-metadata.ts:41-81)", () => {
  it("latches `Set effort level to X`, newest wins", () => {
    const jsonl =
      stdout(
        "<local-command-stdout>Set effort level to high</local-command-stdout>",
      ) +
      stdout(
        "<local-command-stdout>Set effort level to xhigh</local-command-stdout>",
      );
    expect(parseTranscript(jsonl).effortLevel).toBe("xhigh");
  });
  it("matches `Set model to … with X effort`", () => {
    const jsonl = stdout(
      "<local-command-stdout>Set model to Fable 5 with max effort</local-command-stdout>",
    );
    expect(parseTranscript(jsonl).effortLevel).toBe("max");
  });
  it("absent when no marker exists", () => {
    expect(parseTranscript(stdout("hello")).effortLevel).toBeUndefined();
  });
});
