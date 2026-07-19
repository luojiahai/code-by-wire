import { describe, expect, it } from "vitest";
import {
  scanRolloutTelemetry,
  breakdownFromTokenUsage,
} from "../../src/main/provider/codex/usage";

const line = (o: unknown): string => JSON.stringify(o);

const tokenCount = (
  ts: string,
  total: Record<string, number>,
  last: Record<string, number>,
  window: number | null = 272_000,
): string =>
  line({
    timestamp: ts,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: total,
        last_token_usage: last,
        model_context_window: window,
      },
      rate_limits: null,
    },
  });

const turnContext = (ts: string, model: string, effort?: string): string =>
  line({ timestamp: ts, type: "turn_context", payload: { model, effort } });

const usage = (
  input: number,
  cached: number,
  output: number,
  total: number,
): Record<string, number> => ({
  input_tokens: input,
  cached_input_tokens: cached,
  output_tokens: output,
  reasoning_output_tokens: 0,
  total_tokens: total,
});

describe("scanRolloutTelemetry", () => {
  it("normalizes cumulative usage: input excludes cached, cacheRead carries it", () => {
    const jsonl = [
      turnContext("2026-07-19T10:00:00.000Z", "gpt-5.3-codex", "medium"),
      tokenCount(
        "2026-07-19T10:00:10.000Z",
        usage(1_000, 600, 200, 1_200),
        usage(1_000, 600, 200, 1_200),
      ),
    ].join("\n");
    const t = scanRolloutTelemetry(jsonl);
    expect(t.usage.inputTokens).toBe(400); // 1000 − 600
    expect(t.usage.cacheReadTokens).toBe(600);
    expect(t.usage.outputTokens).toBe(200);
    expect(t.usage.cacheCreationTokens).toBe(0);
    expect(t.modelRaw).toBe("gpt-5.3-codex");
    expect(t.effortLevel).toBe("medium");
    expect(t.contextTokens).toBe(1_200);
    expect(t.modelContextWindow).toBe(272_000);
  });

  it("attributes total_token_usage DELTAS to the model active at each event, summing to the final total", () => {
    const jsonl = [
      turnContext("2026-07-19T10:00:00.000Z", "gpt-5.3-codex"),
      tokenCount(
        "2026-07-19T10:00:10.000Z",
        usage(1_000, 0, 100, 1_100),
        usage(1_000, 0, 100, 1_100),
      ),
      turnContext("2026-07-19T10:01:00.000Z", "gpt-5.3-codex-spark"),
      tokenCount(
        "2026-07-19T10:01:10.000Z",
        usage(3_000, 0, 400, 3_400),
        usage(2_000, 0, 300, 2_300),
      ),
    ].join("\n");
    const t = scanRolloutTelemetry(jsonl);
    expect(t.usageByModel).toEqual([
      {
        modelRaw: "gpt-5.3-codex",
        usage: expect.objectContaining({
          inputTokens: 1_000,
          outputTokens: 100,
        }),
      },
      {
        modelRaw: "gpt-5.3-codex-spark",
        usage: expect.objectContaining({
          inputTokens: 2_000,
          outputTokens: 300,
        }),
      },
    ]);
    const sumIn = t.usageByModel.reduce((a, m) => a + m.usage.inputTokens, 0);
    expect(sumIn).toBe(t.usage.inputTokens);
    // tokenEvents carry the same normalized deltas with timestamps
    expect(t.tokenEvents).toEqual([
      {
        tsMs: Date.parse("2026-07-19T10:00:10.000Z"),
        input: 1_000,
        output: 100,
      },
      {
        tsMs: Date.parse("2026-07-19T10:01:10.000Z"),
        input: 2_000,
        output: 300,
      },
    ]);
  });

  it("skips info:null token_counts (rate-limit-only updates) and malformed lines", () => {
    const jsonl = [
      line({
        timestamp: "2026-07-19T10:00:00.000Z",
        type: "event_msg",
        payload: { type: "token_count", info: null },
      }),
      "{not json",
      tokenCount(
        "2026-07-19T10:00:10.000Z",
        usage(500, 0, 50, 550),
        usage(500, 0, 50, 550),
      ),
    ].join("\n");
    const t = scanRolloutTelemetry(jsonl);
    expect(t.usage.inputTokens).toBe(500);
    expect(t.tokenEvents.length).toBe(1);
  });

  it("accepts the legacy cache_read_input_tokens field name", () => {
    const jsonl = tokenCount(
      "2026-07-19T10:00:10.000Z",
      {
        input_tokens: 800,
        cache_read_input_tokens: 300,
        output_tokens: 10,
        total_tokens: 810,
      },
      {
        input_tokens: 800,
        cache_read_input_tokens: 300,
        output_tokens: 10,
        total_tokens: 810,
      },
    );
    const t = scanRolloutTelemetry(jsonl);
    expect(t.usage.inputTokens).toBe(500);
    expect(t.usage.cacheReadTokens).toBe(300);
  });

  it("maps cache_write_input_tokens (codex ≥0.145) into cacheCreation, defaulting 0 when absent", () => {
    const jsonl = tokenCount(
      "2026-07-19T10:00:10.000Z",
      {
        input_tokens: 900,
        cached_input_tokens: 100,
        cache_write_input_tokens: 50,
        output_tokens: 10,
        total_tokens: 910,
      },
      {
        input_tokens: 900,
        cached_input_tokens: 100,
        cache_write_input_tokens: 50,
        output_tokens: 10,
        total_tokens: 910,
      },
    );
    const t = scanRolloutTelemetry(jsonl);
    expect(t.usage.cacheCreationTokens).toBe(50);
    expect(t.liveContext).toEqual({
      input: 800,
      cacheRead: 100,
      cacheCreation: 50,
    });
  });

  it("counts compacted lines and buckets model-less usage under null", () => {
    const jsonl = [
      tokenCount(
        "2026-07-19T10:00:10.000Z",
        usage(100, 0, 10, 110),
        usage(100, 0, 10, 110),
      ),
      line({
        timestamp: "2026-07-19T10:00:20.000Z",
        type: "compacted",
        payload: {},
      }),
      line({
        timestamp: "2026-07-19T10:00:30.000Z",
        type: "compacted",
        payload: {},
      }),
    ].join("\n");
    const t = scanRolloutTelemetry(jsonl);
    expect(t.compactionCount).toBe(2);
    expect(t.usageByModel).toEqual([
      { modelRaw: null, usage: expect.anything() },
    ]);
  });

  it("clamps a cumulative reset (delta would go negative) to zero instead of corrupting buckets", () => {
    const jsonl = [
      tokenCount(
        "2026-07-19T10:00:10.000Z",
        usage(1_000, 0, 100, 1_100),
        usage(1_000, 0, 100, 1_100),
      ),
      tokenCount(
        "2026-07-19T10:00:20.000Z",
        usage(200, 0, 20, 220),
        usage(200, 0, 20, 220),
      ),
    ].join("\n");
    const t = scanRolloutTelemetry(jsonl);
    // final cumulative is the last total_token_usage; the reset event contributes a zero delta
    expect(t.usage.inputTokens).toBe(200);
    expect(t.tokenEvents[1]).toEqual({
      tsMs: Date.parse("2026-07-19T10:00:20.000Z"),
      input: 0,
      output: 0,
    });
  });

  it("returns the empty shape for an empty/eventless rollout", () => {
    const t = scanRolloutTelemetry("");
    expect(t.usage.inputTokens).toBe(0);
    expect(t.usageByModel).toEqual([]);
    expect(t.contextTokens).toBe(0);
    expect(t.liveContext).toBeNull();
    expect(t.modelContextWindow).toBeNull();
    expect(t.modelRaw).toBeNull();
    expect(t.compactionCount).toBe(0);
  });
});

describe("breakdownFromTokenUsage", () => {
  it("builds the shared breakdown shape with the input−cached subtraction", () => {
    expect(
      breakdownFromTokenUsage({
        input_tokens: 1_000,
        cached_input_tokens: 600,
        cache_write_input_tokens: 40,
      }),
    ).toEqual({ input: 400, cacheRead: 600, cacheCreation: 40 });
  });
});
