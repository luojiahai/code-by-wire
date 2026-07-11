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

// A main transcript that dispatches `toolUseId` in the background: the dispatch's tool_result is
// the CLI's immediate "async_launched" acknowledgment, not a completion — the agent is still running.
function asyncMain(toolUseId: string, agentId: string): any[] {
  return [
    {
      type: "assistant",
      timestamp: "2026-06-04T03:00:00.000Z",
      message: {
        content: [{ type: "tool_use", id: toolUseId, name: "Agent" }],
      },
    },
    {
      type: "user",
      timestamp: "2026-06-04T03:00:01.000Z",
      message: {
        content: [
          { type: "tool_result", tool_use_id: toolUseId, is_error: false },
        ],
      },
      toolUseResult: { isAsync: true, status: "async_launched", agentId },
    },
  ];
}

function agent(
  agentId: string,
  toolUseId: string,
  agentType: string,
  rows: any[],
  description = "",
): SubagentSource {
  return { agentId, meta: { agentType, toolUseId, description }, rows };
}

// A main assistant turn with message id `msgId` that dispatches every id in `toolUseIds`, each
// recorded as a successful result. Unlike `main()`, this carries a message id, so the dispatched
// agents resolve a batchId.
function batch(msgId: string, toolUseIds: string[]): any[] {
  return [
    {
      type: "assistant",
      message: {
        id: msgId,
        content: toolUseIds.map((id) => ({
          type: "tool_use",
          id,
          name: "Agent",
        })),
      },
    },
    ...toolUseIds.map((id) => ({
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: id, is_error: false }],
      },
    })),
  ];
}

// The dequeued user row of a <task-notification>: the CLI's real stop signal for a background
// agent. taskId is the agentId; the row's message.content is the raw notification string.
function notificationRow(taskId: string, status: string, ts: string): any {
  return {
    type: "user",
    timestamp: ts,
    message: {
      role: "user",
      content: `<task-notification>\n<task-id>${taskId}</task-id>\n<tool-use-id>tu-x</tool-use-id>\n<output-file>/tmp/${taskId}.output</output-file>\n<status>${status}</status>\n<summary>Agent finished</summary>\n</task-notification>`,
    },
  };
}

// The queue-operation twin, written at enqueue time (top-level string content, no message).
// A mid-turn parent can hold the user row back for minutes; this row is immediate.
function queueNotificationRow(taskId: string, status: string, ts: string): any {
  return {
    type: "queue-operation",
    operation: "enqueue",
    timestamp: ts,
    content: `<task-notification>\n<task-id>${taskId}</task-id>\n<status>${status}</status>\n</task-notification>`,
  };
}

// A minimal positioned assistant row for a subagent transcript.
const ar = (ts: string): any => ({
  type: "assistant",
  timestamp: ts,
  message: {
    model: SONNET,
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [],
  },
});

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
  it("counts tokens like the CLI: the last assistant snapshot, cache included", () => {
    // The CLI's per-agent number (live counter and "Done (N tool uses · X tokens)") is the LAST
    // assistant message's input + output + cache read + cache creation. An earlier turn's usage —
    // however large — must not be summed in.
    const forest = buildSubagentForest(main("tu-1", { is_error: false }), [
      agent("a1", "tu-1", "Explore", [
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:00.000Z",
          message: {
            id: "m-1",
            model: SONNET,
            usage: {
              input_tokens: 3,
              output_tokens: 900,
              cache_read_input_tokens: 30_000,
              cache_creation_input_tokens: 9_000,
            },
            content: [],
          },
        },
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:10.000Z",
          message: {
            id: "m-2",
            model: SONNET,
            usage: {
              input_tokens: 2,
              output_tokens: 50,
              cache_read_input_tokens: 40_000,
              cache_creation_input_tokens: 200,
            },
            content: [],
          },
        },
      ]),
    ]);
    expect(forest[0].tokens).toBe(2 + 50 + 40_000 + 200);
  });

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
        tokens: 52, // the last snapshot (2 + 50), not a sum across turns
        durationMs: 10000,
        toolCount: 0,
        startMs: Date.parse("2026-06-04T03:00:00.000Z"),
        dispatchId: "tu-1",
      },
      {
        id: "a2",
        type: "general-purpose",
        status: "done",
        model: "haiku",
        tokens: 10,
        durationMs: 0,
        toolCount: 0,
        startMs: Date.parse("2026-06-04T03:00:01.000Z"),
        dispatchId: "tu-2",
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
        toolCount: 1,
        startMs: Date.parse("2026-06-04T03:00:00.000Z"),
        dispatchId: "root",
        children: [
          {
            id: "kid",
            type: "Explore",
            status: "done",
            model: "haiku",
            tokens: 5,
            durationMs: 0,
            toolCount: 0,
            startMs: Date.parse("2026-06-04T03:00:01.000Z"),
            dispatchId: "child",
          },
        ],
      },
    ]);
  });

  it("surfaces dispatchId from the meta toolUseId, for a root and a nested child", () => {
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
    expect(forest[0].dispatchId).toBe("root");
    expect(forest[0].children![0].dispatchId).toBe("child");
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

  it("keeps a background-launched agent working despite the launch-ack result", () => {
    // A background dispatch gets an immediate non-error tool_result (toolUseResult.status
    // "async_launched") while the agent keeps running. That ack must not read as completion.
    const forest = buildSubagentForest(asyncMain("tu-1", "a1"), [
      agent("a1", "tu-1", "Explore", [ar("2026-06-04T03:00:02.000Z")]),
    ]);
    expect(forest[0].status).toBe("working");
  });

  it("counts a streamed turn once (no per-row inflation)", () => {
    const forest = buildSubagentForest(main("tu-1", { is_error: false }), [
      // 5 rows, same id + usage {3, 12}: the turn's tokens are 15, not 75.
      agent("a1", "tu-1", "Explore", streamedTurn("msg-1", SONNET, 3, 12, 5)),
    ]);
    expect(forest[0].tokens).toBe(15);
  });

  it("drill tokens use the LAST usage snapshot of a repeated message id", () => {
    // A subagent turn streamed as progressive snapshots: output grows [0, 0, 764]. The node's
    // tokens must reflect the final billed row, not the first near-zero one.
    const snap = (out: number) => ({
      type: "assistant",
      timestamp: "2026-06-04T03:00:00.000Z",
      message: {
        id: "m-grow",
        model: SONNET,
        usage: { input_tokens: 10, output_tokens: out },
        content: [],
      },
    });
    const forest = buildSubagentForest(main("tu-1", { is_error: false }), [
      agent("a1", "tu-1", "Explore", [snap(0), snap(0), snap(764)]),
    ]);
    expect(forest).toHaveLength(1);
    expect(forest[0].tokens).toBe(774); // 10 + 764, not 10 + 0
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
        toolCount: 0,
        dispatchId: "tu-1",
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

  it("surfaces toolCount from the agent's own tool_use ids and the meta description", () => {
    const forest = buildSubagentForest(main("tu-1", { is_error: false }), [
      agent(
        "a1",
        "tu-1",
        "Explore",
        [
          {
            type: "assistant",
            timestamp: "2026-06-04T03:00:00.000Z",
            message: {
              model: SONNET,
              usage: { input_tokens: 1, output_tokens: 1 },
              content: [
                { type: "tool_use", id: "t1", name: "Read" },
                { type: "tool_use", id: "t2", name: "Bash" },
              ],
            },
          },
        ],
        "Find the page files",
      ),
    ]);
    expect(forest[0].toolCount).toBe(2);
    expect(forest[0].description).toBe("Find the page files");
  });

  it("counts a nested dispatch in toolCount and leaves an empty description unset", () => {
    // The nested case: parent dispatches one child (toolCount 1, the dispatch itself counts);
    // the child made no tool calls and carries no description.
    const forest = buildSubagentForest(main("root", { is_error: false }), [
      agent(
        "parent",
        "root",
        "general-purpose",
        [
          {
            type: "assistant",
            timestamp: "2026-06-04T03:00:00.000Z",
            message: {
              usage: { input_tokens: 1, output_tokens: 1 },
              content: [{ type: "tool_use", id: "child", name: "Task" }],
            },
          },
        ],
        "parent task",
      ),
      agent("kid", "child", "Explore", [
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:01.000Z",
          message: {
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [],
          },
        },
      ]),
    ]);
    expect(forest[0].toolCount).toBe(1);
    expect(forest[0].description).toBe("parent task");
    expect(forest[0].children![0].toolCount).toBe(0);
    expect(forest[0].children![0].description).toBeUndefined();
  });

  it("shares a batchId across agents dispatched in one assistant message", () => {
    const forest = buildSubagentForest(batch("msg-1", ["tu-1", "tu-2"]), [
      agent("a1", "tu-1", "general-purpose", [ar("2026-06-04T03:00:00.000Z")]),
      agent("a2", "tu-2", "general-purpose", [ar("2026-06-04T03:00:01.000Z")]),
    ]);
    expect(forest.map((n) => n.batchId)).toEqual(["msg-1", "msg-1"]);
  });

  it("gives agents dispatched in different messages different batchIds", () => {
    const forest = buildSubagentForest(
      [...batch("msg-1", ["tu-1"]), ...batch("msg-2", ["tu-2"])],
      [
        agent("a1", "tu-1", "general-purpose", [
          ar("2026-06-04T03:00:00.000Z"),
        ]),
        agent("a2", "tu-2", "general-purpose", [
          ar("2026-06-04T03:00:01.000Z"),
        ]),
      ],
    );
    expect(forest.map((n) => n.batchId)).toEqual(["msg-1", "msg-2"]);
  });

  it("sets a nested agent's batchId to its parent's dispatching message id", () => {
    const forest = buildSubagentForest(batch("root-msg", ["p"]), [
      agent("parent", "p", "general-purpose", [
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:00.000Z",
          message: {
            id: "parent-msg",
            model: SONNET,
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [{ type: "tool_use", id: "c", name: "Agent" }],
          },
        },
        {
          type: "user",
          timestamp: "2026-06-04T03:00:05.000Z",
          message: {
            content: [
              { type: "tool_result", tool_use_id: "c", is_error: false },
            ],
          },
        },
      ]),
      agent("kid", "c", "Explore", [ar("2026-06-04T03:00:01.000Z")]),
    ]);
    expect(forest[0].batchId).toBe("root-msg");
    expect(forest[0].children![0].batchId).toBe("parent-msg");
  });

  it("leaves batchId unset when the dispatch row carries no message id", () => {
    // `main()` builds an assistant row with no message.id, so the dispatch is unlocatable.
    const forest = buildSubagentForest(main("tu-1", { is_error: false }), [
      agent("a1", "tu-1", "Explore", [ar("2026-06-04T03:00:00.000Z")]),
    ]);
    expect(forest[0].batchId).toBeUndefined();
  });

  it("settles a background agent done on its completed task-notification", () => {
    const forest = buildSubagentForest(
      [
        ...asyncMain("tu-1", "a1"),
        notificationRow("a1", "completed", "2026-06-04T03:05:00.000Z"),
      ],
      [agent("a1", "tu-1", "Explore", [ar("2026-06-04T03:00:02.000Z")])],
    );
    expect(forest[0].status).toBe("done");
  });

  it("settles a background agent failed on a failed notification", () => {
    const forest = buildSubagentForest(
      [
        ...asyncMain("tu-1", "a1"),
        notificationRow("a1", "failed", "2026-06-04T03:05:00.000Z"),
      ],
      [agent("a1", "tu-1", "Explore", [ar("2026-06-04T03:00:02.000Z")])],
    );
    expect(forest[0].status).toBe("failed");
  });

  it("maps a killed notification to failed", () => {
    const forest = buildSubagentForest(
      [
        ...asyncMain("tu-1", "a1"),
        notificationRow("a1", "killed", "2026-06-04T03:05:00.000Z"),
      ],
      [agent("a1", "tu-1", "Explore", [ar("2026-06-04T03:00:02.000Z")])],
    );
    expect(forest[0].status).toBe("failed");
  });

  it("reads a notification present only as a queue-operation row", () => {
    // The parent was mid-turn: the user row never landed, only the enqueue row did.
    const forest = buildSubagentForest(
      [
        ...asyncMain("tu-1", "a1"),
        queueNotificationRow("a1", "completed", "2026-06-04T03:05:00.000Z"),
      ],
      [agent("a1", "tu-1", "Explore", [ar("2026-06-04T03:00:02.000Z")])],
    );
    expect(forest[0].status).toBe("done");
  });

  it("ignores a notification whose task-id matches no known agent", () => {
    // Background Bash tasks and workflows notify too — foreign task-ids must not touch agents.
    const forest = buildSubagentForest(
      [
        ...asyncMain("tu-1", "a1"),
        notificationRow("bash-task-9", "completed", "2026-06-04T03:05:00.000Z"),
      ],
      [agent("a1", "tu-1", "Explore", [ar("2026-06-04T03:00:02.000Z")])],
    );
    expect(forest[0].status).toBe("working");
  });

  it("treats an unknown notification status as a no-op", () => {
    // A future CLI status value must never wrongly finish or fail an agent.
    const forest = buildSubagentForest(
      [
        ...asyncMain("tu-1", "a1"),
        notificationRow("a1", "running", "2026-06-04T03:05:00.000Z"),
      ],
      [agent("a1", "tu-1", "Explore", [ar("2026-06-04T03:00:02.000Z")])],
    );
    expect(forest[0].status).toBe("working");
  });

  it("does not let a malformed block (missing <status>) steal the next block's status, nor lose the next block's own notification", () => {
    // Two <task-notification> blocks in ONE row's text: the first is malformed (no <status>), the
    // second is well-formed for a DIFFERENT agent. A regex that isn't scoped per-block can let its
    // lazy match skip past the first block's own closing tag and grab the second block's <status> —
    // misattributing it to the first agent's task-id, and losing the second block's own notification
    // (matchAll resumes scanning past it). Each block must be isolated by its own closing tag first.
    const malformedThenWellFormed =
      "<task-notification>\n<task-id>a1</task-id>\n<tool-use-id>tu-x</tool-use-id>\n<output-file>/tmp/a1.output</output-file>\n<summary>Agent finished</summary>\n</task-notification>\n" +
      "<task-notification>\n<task-id>a2</task-id>\n<tool-use-id>tu-y</tool-use-id>\n<output-file>/tmp/a2.output</output-file>\n<status>completed</status>\n<summary>Agent finished</summary>\n</task-notification>";
    const forest = buildSubagentForest(
      [
        ...asyncMain("tu-1", "a1"),
        ...asyncMain("tu-2", "a2"),
        {
          type: "user",
          timestamp: "2026-06-04T03:05:00.000Z",
          message: { role: "user", content: malformedThenWellFormed },
        },
      ],
      [
        agent("a1", "tu-1", "Explore", [ar("2026-06-04T03:00:02.000Z")]),
        agent("a2", "tu-2", "Explore", [ar("2026-06-04T03:00:03.000Z")]),
      ],
    );
    const byId = Object.fromEntries(forest.map((n) => [n.id, n]));
    expect(byId.a1.status).toBe("working"); // malformed block must not falsely settle a1
    expect(byId.a2.status).toBe("done"); // a2's own well-formed notification must not be lost
  });

  it("does not parse notification text quoted inside an assistant row", () => {
    // An assistant echoing notification text (e.g. discussing one) is not a real stop signal.
    const forest = buildSubagentForest(
      [
        ...asyncMain("tu-1", "a1"),
        {
          type: "assistant",
          timestamp: "2026-06-04T03:05:00.000Z",
          message: {
            content: [
              {
                type: "text",
                text: "<task-notification>\n<task-id>a1</task-id>\n<status>completed</status>\n</task-notification>",
              },
            ],
          },
        },
      ],
      [agent("a1", "tu-1", "Explore", [ar("2026-06-04T03:00:02.000Z")])],
    );
    expect(forest[0].status).toBe("working");
  });
});
