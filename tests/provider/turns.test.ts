import { describe, it, expect } from "vitest";
import { extractTurns } from "../../src/main/provider/claude/turns";

/** One JSONL line. */
const line = (o: unknown): string => JSON.stringify(o);

const assistant = (over: Record<string, unknown> = {}): string => {
  const { message: msgOver, ...topOver } = over;
  return line({
    type: "assistant",
    cwd: "/work/code-by-wire",
    gitBranch: "main",
    timestamp: "2026-06-09T03:00:00.000Z",
    message: {
      role: "assistant",
      id: "msg-a",
      model: "claude-opus-4-8",
      usage: {
        input_tokens: 100,
        output_tokens: 10,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 2,
      },
      content: [{ type: "text", text: "ok" }],
      ...((msgOver as object) ?? {}),
    },
    ...topOver,
  });
};

describe("extractTurns", () => {
  it("projects an assistant turn into a turn record with full cwd and basename project", () => {
    const turns = extractTurns(assistant(), "sess-1");
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      messageId: "msg-a",
      sessionId: "sess-1",
      ts: Date.parse("2026-06-09T03:00:00.000Z"),
      modelRaw: "claude-opus-4-8",
      cwd: "/work/code-by-wire",
      project: "code-by-wire",
      branch: "main",
      usage: {
        inputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: 5,
        cacheCreationTokens: 2,
      },
    });
  });

  it("counts a turn split across content-block lines once (same message id)", () => {
    // Claude writes one turn across several lines, each repeating the id + usage. Counting per line
    // would multiply the turn's tokens.
    const jsonl = [assistant(), assistant()].join("\n") + "\n";
    expect(extractTurns(jsonl, "sess-1")).toHaveLength(1);
  });

  it("excludes synthetic placeholder turns", () => {
    const synthetic = line({
      type: "assistant",
      cwd: "/w",
      message: {
        role: "assistant",
        id: "msg-syn",
        model: "<synthetic>",
        usage: { input_tokens: 999, output_tokens: 99 },
      },
    });
    expect(extractTurns(synthetic, "sess-1")).toEqual([]);
  });

  it("includes Subagent (sidechain) turns — they are real usage", () => {
    const side = assistant({ isSidechain: true, message: { id: "msg-side" } });
    const turns = extractTurns(side, "sess-1");
    expect(turns).toHaveLength(1);
    expect(turns[0].messageId).toBe("msg-side");
  });

  it("ignores non-assistant rows and rows without a usage block", () => {
    const jsonl = [
      line({ type: "user", message: { role: "user", content: "hi" } }),
      line({
        type: "assistant",
        message: { role: "assistant", id: "no-usage" },
      }),
    ].join("\n");
    expect(extractTurns(jsonl, "sess-1")).toEqual([]);
  });

  it("gives an id-less turn a position-stable surrogate id so a re-scan is idempotent", () => {
    const noId = line({
      type: "assistant",
      cwd: "/w",
      message: {
        role: "assistant",
        model: "claude-opus-4-8",
        usage: { input_tokens: 1 },
      },
    });
    const a = extractTurns(noId, "sess-1");
    const b = extractTurns(noId, "sess-1");
    expect(a).toHaveLength(1);
    expect(a[0].messageId).toBe(b[0].messageId); // deterministic across re-parses
  });

  it("counts two distinct id-less turns separately, with distinct surrogate ids", () => {
    const a = line({
      type: "assistant",
      cwd: "/w",
      message: {
        role: "assistant",
        model: "claude-opus-4-8",
        usage: { input_tokens: 1 },
      },
    });
    const b = line({
      type: "assistant",
      cwd: "/w2",
      message: {
        role: "assistant",
        model: "claude-opus-4-8",
        usage: { input_tokens: 2 },
      },
    });
    const turns = extractTurns([a, b].join("\n"), "sess-1");
    expect(turns).toHaveLength(2);
    expect(new Set(turns.map((t) => t.messageId)).size).toBe(2);
  });

  it("splits cache-creation into 5m and 1h from the cache_creation sub-object", () => {
    const jsonl = line({
      type: "assistant",
      cwd: "/w",
      timestamp: "2026-06-09T03:00:00.000Z",
      message: {
        role: "assistant",
        id: "msg-cc",
        model: "claude-opus-4-8",
        usage: {
          input_tokens: 1,
          cache_creation_input_tokens: 100,
          cache_creation: {
            ephemeral_5m_input_tokens: 60,
            ephemeral_1h_input_tokens: 40,
          },
        },
      },
    });
    const [t] = extractTurns(jsonl, "sess-1");
    expect(t.usage.cacheCreationTokens).toBe(100);
    expect(t.usage.cacheCreation5mTokens).toBe(60);
    expect(t.usage.cacheCreation1hTokens).toBe(40);
  });

  it("keys an id-less turn on its absolute line, stable across a full vs tail parse", () => {
    // Two id-less assistant turns on lines 0 and 1. Parsing the whole file and parsing only the tail
    // (line 1) with startLine=1 must yield the SAME surrogate for line 1 — that is what lets an
    // incremental pass over an appended tail upsert in place instead of double-counting.
    const idless = (input: number) =>
      line({
        type: "assistant",
        cwd: "/w",
        message: {
          role: "assistant",
          model: "claude-opus-4-8",
          usage: { input_tokens: input },
        },
      });
    const full = extractTurns([idless(1), idless(2)].join("\n"), "sess-1");
    const tail = extractTurns(idless(2), "sess-1", "sess-1", 1);
    expect(full).toHaveLength(2);
    expect(tail).toHaveLength(1);
    expect(tail[0].messageId).toBe(full[1].messageId); // line 1's surrogate is identical either way
    expect(full[0].messageId).not.toBe(full[1].messageId); // lines 0 and 1 stay distinct
  });
});
