import { describe, it, expect } from "vitest";
import { computeTokenSpeed } from "../src/main/provider/claude/transcript-speed";

// Build a minimal JSONL-row pair: a user turn at userTs, an assistant turn at asstTs with usage.
function turnRows(
  userTs: string,
  asstTs: string,
  id: string,
  input: number,
  output: number,
) {
  return [
    { type: "user", timestamp: userTs, message: { content: "hi" } },
    {
      type: "assistant",
      timestamp: asstTs,
      message: { id, usage: { input_tokens: input, output_tokens: output } },
    },
  ];
}

describe("computeTokenSpeed", () => {
  it("rates tokens over the active interval (user→assistant)", () => {
    const rows = turnRows(
      "2026-06-11T00:00:00.000Z",
      "2026-06-11T00:00:10.000Z",
      "m1",
      200,
      1000,
    );
    const s = computeTokenSpeed(rows, 0); // window 0 = full session
    expect(s).not.toBeNull();
    expect(s!.outputTps).toBeCloseTo(100, 5); // 1000 / 10s
    expect(s!.inputTps).toBeCloseTo(20, 5);
    expect(s!.totalTps).toBeCloseTo(120, 5);
  });

  it("counts each assistant message id once (multi-block turns are not multiplied)", () => {
    const rows = [
      {
        type: "user",
        timestamp: "2026-06-11T00:00:00.000Z",
        message: { content: "hi" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-11T00:00:10.000Z",
        message: {
          id: "m1",
          usage: { input_tokens: 200, output_tokens: 1000 },
        },
      },
      {
        type: "assistant",
        timestamp: "2026-06-11T00:00:10.000Z",
        message: {
          id: "m1",
          usage: { input_tokens: 200, output_tokens: 1000 },
        },
      },
    ];
    expect(computeTokenSpeed(rows, 0)!.outputTps).toBeCloseTo(100, 5);
  });

  it("clips to the rolling window anchored at the last activity", () => {
    const rows = [
      ...turnRows(
        "2026-06-11T00:00:00.000Z",
        "2026-06-11T00:00:10.000Z",
        "old",
        0,
        1000,
      ),
      ...turnRows(
        "2026-06-11T00:01:40.000Z",
        "2026-06-11T00:01:50.000Z",
        "new",
        0,
        500,
      ),
    ];
    // 60s window ending at 00:01:50 excludes the 'old' interval entirely → only the 'new' 500 over 10s.
    expect(computeTokenSpeed(rows, 60_000)!.outputTps).toBeCloseTo(50, 5);
  });

  it("returns null with no completed request or zero active duration", () => {
    expect(computeTokenSpeed([], 0)).toBeNull();
    const instant = turnRows(
      "2026-06-11T00:00:00.000Z",
      "2026-06-11T00:00:00.000Z",
      "m1",
      10,
      10,
    );
    expect(computeTokenSpeed(instant, 0)).toBeNull();
  });
});
