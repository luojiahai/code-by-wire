import { describe, it, expect } from "vitest";
import {
  buildSubagentForest,
  type SubagentSource,
} from "../../src/main/provider/claude/subagents";

const SONNET = "global.anthropic.claude-sonnet-4-6";
const HAIKU = "global.anthropic.claude-haiku-4-5";

// A main transcript that dispatches `toolUseId` and (optionally) records its result.
function main(toolUseId: string, result?: { is_error: boolean }): any[] {
  const rows: any[] = [
    {
      type: "assistant",
      message: { content: [{ type: "tool_use", id: toolUseId, name: "Task" }] },
    },
  ];
  if (result)
    rows.push({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            is_error: result.is_error,
          },
        ],
      },
    });
  return rows;
}

function agent(
  agentId: string,
  toolUseId: string,
  agentType: string,
  rows: any[],
): SubagentSource {
  return { agentId, meta: { agentType, toolUseId }, rows };
}

// One assistant turn streamed across `n` rows that repeat the same message id and usage.
function streamedTurn(
  id: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  n: number,
): any[] {
  return Array.from({ length: n }, () => ({
    type: "assistant",
    timestamp: "2026-06-04T03:00:00.000Z",
    message: {
      id,
      model,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      content: [],
    },
  }));
}

describe("buildSubagentForest", () => {
  it("builds a flat fan-out of roots with type/model/tokens/duration", () => {
    const forest = buildSubagentForest(
      [
        ...main("tu-1", { is_error: false }),
        ...main("tu-2", { is_error: false }),
      ],
      [
        agent("a1", "tu-1", "Explore", [
          {
            type: "assistant",
            timestamp: "2026-06-04T03:00:00.000Z",
            message: {
              model: SONNET,
              usage: { input_tokens: 5, output_tokens: 100 },
              content: [],
            },
          },
          {
            type: "assistant",
            timestamp: "2026-06-04T03:00:10.000Z",
            message: {
              model: SONNET,
              usage: { input_tokens: 2, output_tokens: 50 },
              content: [],
            },
          },
        ]),
        agent("a2", "tu-2", "general-purpose", [
          {
            type: "assistant",
            timestamp: "2026-06-04T03:00:01.000Z",
            message: {
              model: HAIKU,
              usage: { input_tokens: 1, output_tokens: 9 },
              content: [],
            },
          },
        ]),
      ],
    );
    expect(forest).toEqual([
      {
        id: "a1",
        type: "Explore",
        status: "done",
        model: "sonnet",
        tokens: 157,
        durationMs: 10000,
        startMs: Date.parse("2026-06-04T03:00:00.000Z"),
      },
      {
        id: "a2",
        type: "general-purpose",
        status: "done",
        model: "haiku",
        tokens: 10,
        durationMs: 0,
        startMs: Date.parse("2026-06-04T03:00:01.000Z"),
      },
    ]);
  });

  it("nests a child under the parent that dispatched it", () => {
    const forest = buildSubagentForest(main("root", { is_error: false }), [
      agent("parent", "root", "general-purpose", [
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:00.000Z",
          message: {
            model: SONNET,
            usage: { input_tokens: 1, output_tokens: 10 },
            content: [{ type: "tool_use", id: "child", name: "Task" }],
          },
        },
        {
          type: "user",
          timestamp: "2026-06-04T03:00:05.000Z",
          message: {
            content: [
              { type: "tool_result", tool_use_id: "child", is_error: false },
            ],
          },
        },
      ]),
      agent("kid", "child", "Explore", [
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:01.000Z",
          message: {
            model: HAIKU,
            usage: { input_tokens: 1, output_tokens: 4 },
            content: [],
          },
        },
      ]),
    ]);
    expect(forest).toEqual([
      {
        id: "parent",
        type: "general-purpose",
        status: "done",
        model: "sonnet",
        tokens: 11,
        durationMs: 5000,
        startMs: Date.parse("2026-06-04T03:00:00.000Z"),
        children: [
          {
            id: "kid",
            type: "Explore",
            status: "done",
            model: "haiku",
            tokens: 5,
            durationMs: 0,
            startMs: Date.parse("2026-06-04T03:00:01.000Z"),
          },
        ],
      },
    ]);
  });

  it("exposes startMs from the agent's first parseable timestamp", () => {
    const forest = buildSubagentForest(main("tu-1", { is_error: false }), [
      agent("a1", "tu-1", "Explore", [
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:00.000Z",
          message: {
            model: SONNET,
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [],
          },
        },
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:10.000Z",
          message: {
            model: SONNET,
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [],
          },
        },
      ]),
    ]);
    expect(forest[0].startMs).toBe(Date.parse("2026-06-04T03:00:00.000Z"));
  });

  it("leaves startMs unset for a timestamp-less agent", () => {
    const forest = buildSubagentForest(main("tu-1"), [
      agent("a1", "tu-1", "Explore", [
        { type: "user", message: { content: [] } },
      ]),
    ]);
    expect(forest[0].startMs).toBeUndefined();
  });

  it("marks a subagent working when its dispatch has no result yet", () => {
    const forest = buildSubagentForest(main("tu-1"), [
      agent("a1", "tu-1", "Explore", [
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:00.000Z",
          message: {
            model: SONNET,
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [],
          },
        },
      ]),
    ]);
    expect(forest[0].status).toBe("working");
  });

  it("marks a subagent failed when its dispatch result is an error", () => {
    const forest = buildSubagentForest(main("tu-1", { is_error: true }), [
      agent("a1", "tu-1", "Explore", [
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:00.000Z",
          message: {
            model: SONNET,
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [],
          },
        },
      ]),
    ]);
    expect(forest[0].status).toBe("failed");
  });

  it("counts a streamed turn once, keyed on message id (no per-row inflation)", () => {
    const forest = buildSubagentForest(main("tu-1", { is_error: false }), [
      // 5 rows, same id + usage {3, 12}: the turn's tokens are 15, not 75.
      agent("a1", "tu-1", "Explore", streamedTurn("msg-1", SONNET, 3, 12, 5)),
    ]);
    expect(forest[0].tokens).toBe(15);
  });

  it("leaves model unset for a subagent that reported no assistant model yet", () => {
    const forest = buildSubagentForest(main("tu-1"), [
      // a just-spawned agent: a row exists but carries no model.
      agent("a1", "tu-1", "Explore", [
        { type: "user", message: { content: [] } },
      ]),
    ]);
    expect(forest).toEqual([
      {
        id: "a1",
        type: "Explore",
        status: "working",
        tokens: 0,
        durationMs: 0,
      },
    ]);
  });

  it("orders timestamp-less agents deterministically by id (no NaN comparator)", () => {
    const noTs = (id: string) =>
      agent(id, `tu-${id}`, "Explore", [
        {
          type: "assistant",
          message: {
            model: SONNET,
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [],
          },
        },
      ]);
    const forest = buildSubagentForest(
      [
        ...main("tu-b", { is_error: false }),
        ...main("tu-a", { is_error: false }),
      ],
      [noTs("b"), noTs("a")],
    );
    expect(forest.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("keeps a self-referential dispatch as a root rather than a cycle", () => {
    // A malformed meta whose toolUseId is also dispatched inside the agent's own transcript: owner would
    // resolve to itself. The forest must stay acyclic (else the renderer recurses forever).
    const forest = buildSubagentForest(main("tu-1", { is_error: false }), [
      agent("loop", "self", "Explore", [
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:00.000Z",
          message: {
            model: SONNET,
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [{ type: "tool_use", id: "self", name: "Task" }],
          },
        },
      ]),
    ]);
    expect(forest.map((n) => n.id)).toEqual(["loop"]);
    expect(forest[0].children).toBeUndefined();
  });

  it("returns [] when there are no subagents", () => {
    expect(buildSubagentForest(main("tu-1", { is_error: false }), [])).toEqual(
      [],
    );
  });
});
