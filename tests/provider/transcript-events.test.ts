import { describe, it, expect } from "vitest";
import { parseTranscriptEvents } from "../../src/main/provider/claude/transcript-events";

const jsonl = (...rows: object[]) =>
  rows.map((r) => JSON.stringify(r)).join("\n");

describe("parseTranscriptEvents — events", () => {
  it("renders user and assistant text in order", () => {
    const { events } = parseTranscriptEvents(
      jsonl(
        {
          type: "user",
          isMeta: false,
          message: { role: "user", content: "Add login" },
        },
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "On it." }],
          },
        },
      ),
    );
    expect(events).toEqual([
      { kind: "user", text: "Add login" },
      { kind: "assistant", text: "On it." },
    ]);
  });

  it("surfaces a slash-command user turn by its command name", () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: "user",
        isMeta: false,
        message: {
          role: "user",
          content:
            "<command-name>/deploy</command-name><command-message>deploy</command-message>",
        },
      }),
    );
    expect(events).toEqual([{ kind: "user", text: "/deploy" }]);
  });

  it("preserves multi-line prose (newlines kept, not collapsed)", () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: "user",
        isMeta: false,
        message: { role: "user", content: "line one\nline two" },
      }),
    );
    expect(events).toEqual([{ kind: "user", text: "line one\nline two" }]);
  });

  it("renders a thinking block", () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "thinking", thinking: "hmm" }],
        },
      }),
    );
    expect(events).toEqual([{ kind: "thinking", text: "hmm" }]);
  });

  it("renders a generic tool call with a summarized input", () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Bash",
              input: { command: "pnpm test" },
            },
          ],
        },
      }),
    );
    expect(events).toEqual([
      {
        kind: "tool",
        name: "Bash",
        input: "pnpm test",
        toolUseId: "t1",
        status: "pending",
        outputLines: 0,
      },
    ]);
  });

  it("renders an Edit as a diff of removed/added lines", () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Edit",
              input: {
                file_path: "a.ts",
                old_string: "a\nb",
                new_string: "a\nc",
              },
            },
          ],
        },
      }),
    );
    expect(events).toEqual([
      {
        kind: "diff",
        tool: "Edit",
        file: "a.ts",
        hunk: { removed: ["a", "b"], added: ["a", "c"] },
        status: "pending",
      },
    ]);
  });

  it("renders a Write as an all-added diff", () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Write",
              input: { file_path: "new.ts", content: "x\ny" },
            },
          ],
        },
      }),
    );
    expect(events).toEqual([
      {
        kind: "diff",
        tool: "Write",
        file: "new.ts",
        hunk: { removed: [], added: ["x", "y"] },
        status: "pending",
      },
    ]);
  });

  it("concatenates MultiEdit edits into one hunk", () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "MultiEdit",
              input: {
                file_path: "m.ts",
                edits: [
                  { old_string: "o1", new_string: "n1" },
                  { old_string: "o2", new_string: "n2" },
                ],
              },
            },
          ],
        },
      }),
    );
    expect(events).toEqual([
      {
        kind: "diff",
        tool: "MultiEdit",
        file: "m.ts",
        hunk: { removed: ["o1", "o2"], added: ["n1", "n2"] },
        status: "pending",
      },
    ]);
  });

  it("renders a Task tool as a subagent dispatch", () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Task",
              input: { subagent_type: "Explore", description: "find usages" },
            },
          ],
        },
      }),
    );
    expect(events).toEqual([
      {
        kind: "subagent",
        agentType: "Explore",
        description: "find usages",
        toolUseId: "t1",
      },
    ]);
  });

  it("renders an Agent tool as a subagent dispatch too", () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Agent",
              input: { subagent_type: "Plan", description: "design the API" },
            },
          ],
        },
      }),
    );
    expect(events).toEqual([
      {
        kind: "subagent",
        agentType: "Plan",
        description: "design the API",
        toolUseId: "t1",
      },
    ]);
  });

  it("carries an empty toolUseId when the subagent dispatch has no id", () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              name: "Task",
              input: { subagent_type: "Explore", description: "x" },
            },
          ],
        },
      }),
    );
    expect(events).toEqual([
      {
        kind: "subagent",
        agentType: "Explore",
        description: "x",
        toolUseId: "",
      },
    ]);
  });

  it("emits a tool event even when the tool_use has no id", () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Bash", input: { command: "ls" } },
          ],
        },
      }),
    );
    expect(events).toEqual([
      {
        kind: "tool",
        name: "Bash",
        input: "ls",
        toolUseId: "",
        status: "pending",
        outputLines: 0,
      },
    ]);
  });

  it("skips meta user turns and tool_result-only user turns", () => {
    const { events } = parseTranscriptEvents(
      jsonl(
        {
          type: "user",
          isMeta: true,
          message: { role: "user", content: "caveat noise" },
        },
        {
          type: "user",
          isMeta: false,
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t1", content: "output" },
            ],
          },
        },
        {
          type: "user",
          isMeta: false,
          message: { role: "user", content: "real prompt" },
        },
      ),
    );
    expect(events).toEqual([{ kind: "user", text: "real prompt" }]);
  });

  it("tolerates a half-written trailing line", () => {
    const { events } = parseTranscriptEvents(
      '{"type":"user","isMeta":false,"message":{"role":"user","content":"hi"}}\n{ broken',
    );
    expect(events).toEqual([{ kind: "user", text: "hi" }]);
  });

  it("back-patches a tool to ok with an output line count when its result lands", () => {
    const { events } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "ls" },
              },
            ],
          },
        },
        {
          type: "user",
          isMeta: false,
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t1", content: "a\nb\nc\n" },
            ],
          },
        },
      ),
    );
    expect(events).toEqual([
      {
        kind: "tool",
        name: "Bash",
        input: "ls",
        toolUseId: "t1",
        status: "ok",
        outputLines: 3,
      },
    ]);
  });

  it("marks a tool error when its result carries is_error", () => {
    const { events } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "false" },
              },
            ],
          },
        },
        {
          type: "user",
          isMeta: false,
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "t1",
                is_error: true,
                content: "boom",
              },
            ],
          },
        },
      ),
    );
    expect(events[0]).toMatchObject({ status: "error", outputLines: 1 });
  });

  it("patches each tool independently and leaves unmatched results alone", () => {
    const { events } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "one" },
              },
              {
                type: "tool_use",
                id: "t2",
                name: "Bash",
                input: { command: "two" },
              },
            ],
          },
        },
        {
          type: "user",
          isMeta: false,
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t2", content: "done" },
            ],
          },
        },
      ),
    );
    expect(events.map((e) => e.kind === "tool" && e.status)).toEqual([
      "pending",
      "ok",
    ]);
  });

  it("back-patches an edit to error when its result fails (e.g. no match)", () => {
    const { events } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "e1",
                name: "Edit",
                input: { file_path: "a.ts", old_string: "x", new_string: "y" },
              },
            ],
          },
        },
        {
          type: "user",
          isMeta: false,
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "e1",
                is_error: true,
                content: "String to replace not found in file.",
              },
            ],
          },
        },
      ),
    );
    expect(events[0]).toMatchObject({
      kind: "diff",
      tool: "Edit",
      status: "error",
    });
  });

  it("back-patches an edit to ok when its result lands without error", () => {
    const { events } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "w1",
                name: "Write",
                input: { file_path: "new.ts", content: "x" },
              },
            ],
          },
        },
        {
          type: "user",
          isMeta: false,
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "w1",
                content: "File created",
              },
            ],
          },
        },
      ),
    );
    expect(events[0]).toMatchObject({ kind: "diff", status: "ok" });
  });
});

describe("parseTranscriptEvents — waiting + sidechain", () => {
  it("reports a waiting reason from an unanswered AskUserQuestion at the tail", () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        {
          type: "user",
          isMeta: false,
          message: { role: "user", content: "go" },
        },
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "q1",
                name: "AskUserQuestion",
                input: { questions: [{ question: "A or B?" }] },
              },
            ],
          },
        },
      ),
    );
    expect(waitingReason).toBe("A or B?");
  });

  it("joins multiple questions", () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "q1",
              name: "AskUserQuestion",
              input: { questions: [{ question: "A?" }, { question: "B?" }] },
            },
          ],
        },
      }),
    );
    expect(waitingReason).toBe("A? · B?");
  });

  it("falls back to a generic reason for an AskUserQuestion with no questions", () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "q1",
              name: "AskUserQuestion",
              input: { questions: [] },
            },
          ],
        },
      }),
    );
    expect(waitingReason).toBe("Waiting on a question");
  });

  it("reports a permission-style reason for a non-question pending tool", () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "b1",
              name: "Bash",
              input: { command: "rm -rf x" },
            },
          ],
        },
      }),
    );
    expect(waitingReason).toBe("Permission: Bash");
  });

  it("clears the waiting reason once the tool has a result", () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "tool_use", id: "b1", name: "Bash", input: {} }],
          },
        },
        {
          type: "user",
          isMeta: false,
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "b1", content: "done" },
            ],
          },
        },
      ),
    );
    expect(waitingReason).toBeNull();
  });

  it("accumulates parallel tool_use across lines of one turn (same message.id), favouring the question", () => {
    // Claude Code writes one assistant turn across several lines — one per content block — so a turn's
    // parallel tools land on separate lines under the same message.id. Both stay pending; the actual
    // question wins over a permission line.
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            role: "assistant",
            id: "m1",
            content: [{ type: "tool_use", id: "r1", name: "Read", input: {} }],
          },
        },
        {
          type: "assistant",
          message: {
            role: "assistant",
            id: "m1",
            content: [
              {
                type: "tool_use",
                id: "q1",
                name: "AskUserQuestion",
                input: { questions: [{ question: "Ship it?" }] },
              },
            ],
          },
        },
      ),
    );
    expect(waitingReason).toBe("Ship it?");
  });

  it("keeps an earlier same-turn tool pending after a later one is answered", () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            role: "assistant",
            id: "m1",
            content: [{ type: "tool_use", id: "r1", name: "Read", input: {} }],
          },
        },
        {
          type: "assistant",
          message: {
            role: "assistant",
            id: "m1",
            content: [{ type: "tool_use", id: "b1", name: "Bash", input: {} }],
          },
        },
        {
          type: "user",
          isMeta: false,
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "b1", content: "done" },
            ],
          },
        },
      ),
    );
    expect(waitingReason).toBe("Permission: Read");
  });

  it("a new turn (new message.id) supersedes the previous turn’s pending tools", () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            role: "assistant",
            id: "m1",
            content: [{ type: "tool_use", id: "b1", name: "Bash", input: {} }],
          },
        },
        {
          type: "assistant",
          message: {
            role: "assistant",
            id: "m2",
            content: [{ type: "text", text: "done" }],
          },
        },
      ),
    );
    expect(waitingReason).toBeNull();
  });

  it("does not latch on a tool the user interrupted earlier (only the latest turn counts)", () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "tool_use", id: "old", name: "Read", input: {} }],
          },
        },
        {
          type: "user",
          isMeta: false,
          message: { role: "user", content: "actually do this instead" },
        },
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Done." }],
          },
        },
      ),
    );
    expect(waitingReason).toBeNull();
  });

  it("drops subagent-internal (isSidechain) turns", () => {
    const { events } = parseTranscriptEvents(
      jsonl(
        {
          type: "user",
          isMeta: false,
          message: { role: "user", content: "parent prompt" },
        },
        {
          type: "assistant",
          isSidechain: true,
          message: {
            role: "assistant",
            content: [{ type: "text", text: "subagent internal" }],
          },
        },
      ),
    );
    expect(events).toEqual([{ kind: "user", text: "parent prompt" }]);
  });
});

describe("parseTranscriptEvents — timeline", () => {
  const ts = (s: string) => Date.parse(`2026-06-08T00:00:${s}.000Z`);

  it("groups rows into turns with duration and tool count", () => {
    const { turns } = parseTranscriptEvents(
      jsonl(
        {
          type: "user",
          isMeta: false,
          timestamp: "2026-06-08T00:00:00.000Z",
          message: { role: "user", content: "first" },
        },
        {
          type: "assistant",
          timestamp: "2026-06-08T00:00:05.000Z",
          message: {
            id: "m1",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "ls" },
              },
            ],
          },
        },
        {
          type: "user",
          isMeta: false,
          timestamp: "2026-06-08T00:00:05.000Z",
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t1", content: "ok" },
            ],
          },
        },
        {
          type: "assistant",
          timestamp: "2026-06-08T00:00:08.000Z",
          message: {
            id: "m1",
            role: "assistant",
            content: [{ type: "text", text: "done" }],
          },
        },
        {
          type: "user",
          isMeta: false,
          timestamp: "2026-06-08T00:00:20.000Z",
          message: { role: "user", content: "second" },
        },
        {
          type: "assistant",
          timestamp: "2026-06-08T00:00:23.000Z",
          message: {
            id: "m2",
            role: "assistant",
            content: [{ type: "text", text: "ok" }],
          },
        },
      ),
    );
    expect(
      turns.map((t) => ({
        index: t.index,
        prompt: t.prompt,
        durationMs: t.durationMs,
        toolCount: t.toolCount,
      })),
    ).toEqual([
      { index: 1, prompt: "first", durationMs: 8000, toolCount: 1 },
      { index: 2, prompt: "second", durationMs: 3000, toolCount: 0 },
    ]);
    expect(turns[0].startMs).toBe(ts("00"));
    expect(turns[0].endMs).toBe(ts("08"));
  });

  it("finalizes the last in-flight turn at end of file", () => {
    const { turns } = parseTranscriptEvents(
      jsonl({
        type: "user",
        isMeta: false,
        timestamp: "2026-06-08T00:00:00.000Z",
        message: { role: "user", content: "only prompt" },
      }),
    );
    expect(turns).toEqual([
      {
        index: 1,
        prompt: "only prompt",
        startMs: ts("00"),
        endMs: ts("00"),
        durationMs: 0,
        toolCount: 0,
      },
    ]);
  });

  it("labels a slash-command turn by its command name", () => {
    const { turns } = parseTranscriptEvents(
      jsonl({
        type: "user",
        isMeta: false,
        message: {
          role: "user",
          content:
            "<command-name>/deploy</command-name><command-message>deploy</command-message>",
        },
      }),
    );
    expect(turns[0].prompt).toBe("/deploy");
  });

  it("counts a subagent dispatch as one tool and ignores sidechain rows", () => {
    const { turns } = parseTranscriptEvents(
      jsonl(
        {
          type: "user",
          isMeta: false,
          message: { role: "user", content: "go" },
        },
        {
          type: "assistant",
          message: {
            id: "m1",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Task",
                input: { subagent_type: "Explore", description: "find" },
              },
            ],
          },
        },
        {
          type: "assistant",
          isSidechain: true,
          message: {
            id: "s1",
            role: "assistant",
            content: [{ type: "tool_use", id: "s-t", name: "Read", input: {} }],
          },
        },
      ),
    );
    expect(turns[0].toolCount).toBe(1);
  });

  it("adopts the first real timestamp as start when the opening prompt has none", () => {
    // A prompt row with no timestamp must not leave startMs at epoch 0 while a later timestamped row
    // pushes endMs to a real epoch — that would render a ~50000-year duration and "ago".
    const { turns } = parseTranscriptEvents(
      jsonl(
        {
          type: "user",
          isMeta: false,
          message: { role: "user", content: "go" },
        },
        {
          type: "assistant",
          timestamp: "2026-06-08T00:00:05.000Z",
          message: {
            id: "m1",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "ls" },
              },
            ],
          },
        },
        {
          type: "assistant",
          timestamp: "2026-06-08T00:00:08.000Z",
          message: {
            id: "m1",
            role: "assistant",
            content: [{ type: "text", text: "done" }],
          },
        },
      ),
    );
    expect(turns[0].startMs).toBe(ts("05"));
    expect(turns[0].endMs).toBe(ts("08"));
    expect(turns[0].durationMs).toBe(3000);
  });
});

describe("parseTranscriptEvents — include-sidechain option", () => {
  const sidechainRows = () =>
    jsonl(
      {
        type: "user",
        isSidechain: true,
        isMeta: false,
        message: { role: "user", content: "Subagent task" },
      },
      {
        type: "assistant",
        isSidechain: true,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Working on it." }],
        },
      },
    );

  it("renders sidechain rows when includeSidechain is on", () => {
    const { events } = parseTranscriptEvents(sidechainRows(), {
      includeSidechain: true,
    });
    expect(events).toEqual([
      { kind: "user", text: "Subagent task" },
      { kind: "assistant", text: "Working on it." },
    ]);
  });

  it("drops sidechain rows by default (option off)", () => {
    const { events } = parseTranscriptEvents(sidechainRows());
    expect(events).toEqual([]);
  });
});

describe("parseTranscriptEvents — current context", () => {
  it("reports the latest assistant turn's cache-state split", () => {
    const { context } = parseTranscriptEvents(
      jsonl({
        type: "assistant",
        message: {
          id: "m1",
          role: "assistant",
          content: [{ type: "text", text: "hi" }],
          usage: {
            input_tokens: 2,
            cache_read_input_tokens: 78_533,
            cache_creation_input_tokens: 2175,
          },
        },
      }),
    );
    expect(context).toEqual({
      input: 2,
      cacheRead: 78_533,
      cacheCreation: 2175,
    });
  });

  it("a later zero-usage (synthetic) turn does not clobber the last real split", () => {
    const { context } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            id: "m1",
            role: "assistant",
            content: [{ type: "text", text: "a" }],
            usage: {
              input_tokens: 1,
              cache_read_input_tokens: 100,
              cache_creation_input_tokens: 0,
            },
          },
        },
        {
          type: "assistant",
          message: {
            id: "m2",
            role: "assistant",
            content: [{ type: "text", text: "b" }],
            usage: {
              input_tokens: 0,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
          },
        },
      ),
    );
    expect(context).toEqual({ input: 1, cacheRead: 100, cacheCreation: 0 });
  });

  it("is null when no assistant turn reported usage", () => {
    const { context } = parseTranscriptEvents(
      jsonl({
        type: "user",
        isMeta: false,
        message: { role: "user", content: "hello" },
      }),
    );
    expect(context).toBeNull();
  });

  it("an isApiErrorMessage row never overrides the current context size", () => {
    const { context } = parseTranscriptEvents(
      jsonl(
        {
          type: "assistant",
          message: {
            id: "m1",
            role: "assistant",
            content: [{ type: "text", text: "ok" }],
            usage: {
              input_tokens: 100,
              cache_read_input_tokens: 900,
              cache_creation_input_tokens: 0,
            },
          },
        },
        {
          type: "assistant",
          isApiErrorMessage: true,
          message: {
            id: "m2",
            role: "assistant",
            content: [{ type: "text", text: "API error" }],
            usage: {
              input_tokens: 3,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
          },
        },
      ),
    );
    expect(context).toEqual({ input: 100, cacheRead: 900, cacheCreation: 0 });
  });
});
