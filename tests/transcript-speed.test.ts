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
    const s = computeTokenSpeed([rows], 0); // window 0 = full session
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
    expect(computeTokenSpeed([rows], 0)!.outputTps).toBeCloseTo(100, 5);
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
    expect(computeTokenSpeed([rows], 60_000)!.outputTps).toBeCloseTo(50, 5);
  });

  it("returns null with no completed request or zero active duration", () => {
    expect(computeTokenSpeed([[]], 0)).toBeNull();
    const instant = turnRows(
      "2026-06-11T00:00:00.000Z",
      "2026-06-11T00:00:00.000Z",
      "m1",
      10,
      10,
    );
    expect(computeTokenSpeed([instant], 0)).toBeNull();
  });

  it("takes the LAST snapshot of a repeated id: final usage, final end timestamp", () => {
    const rows = [
      {
        type: "user",
        timestamp: "2026-06-11T00:00:00.000Z",
        message: { content: "hi" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-11T00:00:05.000Z",
        message: { id: "m1", usage: { input_tokens: 0, output_tokens: 0 } },
      },
      {
        type: "assistant",
        timestamp: "2026-06-11T00:00:10.000Z",
        message: { id: "m1", usage: { input_tokens: 0, output_tokens: 1000 } },
      },
    ];
    const s = computeTokenSpeed([rows], 0);
    expect(s).not.toBeNull();
    expect(s!.outputTps).toBeCloseTo(100, 5); // 1000 tokens over 0→10s, not 0 over 0→5s
  });

  it("dedups a message id across groups and merges concurrent intervals", () => {
    const main = [
      {
        type: "user",
        timestamp: "2026-06-11T00:00:00.000Z",
        message: { content: "hi" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-11T00:00:10.000Z",
        message: { id: "m1", usage: { input_tokens: 0, output_tokens: 600 } },
      },
    ];
    const sub = [
      {
        type: "assistant",
        timestamp: "2026-06-11T00:00:10.000Z",
        message: { id: "m1", usage: { input_tokens: 0, output_tokens: 600 } },
      }, // duplicate of main's m1 — counted once
      {
        type: "user",
        timestamp: "2026-06-11T00:00:00.000Z",
        message: { content: "task" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-11T00:00:10.000Z",
        message: { id: "s1", usage: { input_tokens: 0, output_tokens: 400 } },
      },
    ];
    const s = computeTokenSpeed([main, sub], 0);
    expect(s).not.toBeNull();
    // 600 + 400 over the merged 0→10s window (concurrent intervals merge, m1 counted once).
    expect(s!.outputTps).toBeCloseTo(100, 5);
  });

  it("does not pair a group's trailing user turn with the next group's assistant", () => {
    const groupA = [
      {
        type: "user",
        timestamp: "2026-06-11T00:00:00.000Z",
        message: { content: "hi" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-11T00:00:10.000Z",
        message: { id: "a1", usage: { input_tokens: 0, output_tokens: 1000 } },
      },
      // Trailing user turn with NO following assistant in this group — leaves a dangling
      // pendingUserTs ONLY if the pairing state wrongly persists across the group boundary.
      {
        type: "user",
        timestamp: "2026-06-11T00:01:40.000Z",
        message: { content: "dangling" },
      },
    ];
    const groupB = [
      {
        type: "assistant",
        timestamp: "2026-06-11T00:03:20.000Z",
        message: { id: "b1", usage: { input_tokens: 0, output_tokens: 500 } },
      },
    ];
    const s = computeTokenSpeed([groupA, groupB], 0);
    expect(s).not.toBeNull();
    // Correct (per-group reset): b1's interval is zero-length [200s, 200s]; total active duration is
    // just groupA's [0s, 10s] = 10s, so outputTps = (1000 + 500) / 10 = 150.
    // A broken reset would pair b1 with the 100s dangling user turn → interval [100s, 200s], inflating
    // the denominator to 110s and giving a different (~13.6) tps.
    expect(s!.outputTps).toBeCloseTo(150, 5);
  });

  it("A4: an isApiErrorMessage assistant row contributes no interval or tokens", () => {
    const t0 = Date.parse("2026-07-10T00:00:00Z");
    const rows = [
      { type: "user", timestamp: new Date(t0).toISOString() },
      {
        type: "assistant",
        isApiErrorMessage: true,
        timestamp: new Date(t0 + 5_000).toISOString(),
        message: { id: "m1", usage: { input_tokens: 100, output_tokens: 100 } },
      },
    ];
    expect(computeTokenSpeed([rows], 60_000)).toBeNull();
  });

  it("A4: main-transcript sidechain rows are skipped; subagent-group rows count", () => {
    const t0 = Date.parse("2026-07-10T00:00:00Z");
    const side = {
      type: "assistant",
      isSidechain: true,
      timestamp: new Date(t0 + 5_000).toISOString(),
      message: { id: "m2", usage: { input_tokens: 60, output_tokens: 60 } },
    };
    const user = { type: "user", timestamp: new Date(t0).toISOString() };
    // In the main group (index 0) the sidechain row is invisible → no completed request …
    expect(computeTokenSpeed([[user, side]], 60_000)).toBeNull();
    // … but the SAME row inside a subagent group (index > 0) is real throughput. The subagent group
    // carries its own leading user row so the sidechain row has a non-zero interval to be measured over.
    const subUser = { type: "user", timestamp: new Date(t0).toISOString() };
    expect(computeTokenSpeed([[user], [subUser, side]], 60_000)).not.toBeNull();
  });
});
