import { describe, it, expect } from "vitest";
import { parseRolloutEvents } from "../../src/main/provider/codex/transcript-events";

/** One rollout envelope line. Timestamps only matter for turn tests (Task 3). */
export const line = (
  type: string,
  payload: unknown,
  timestamp = "2026-07-19T08:37:20.000Z",
): string => JSON.stringify({ timestamp, type, payload });

export const jsonl = (...lines: string[]): string => lines.join("\n");

const META = line("session_meta", {
  id: "019f7760-67c9-7512-b20c-6928bfdd8182",
  timestamp: "2026-07-19T08:37:14.000Z",
  cwd: "/Users/me/proj",
  originator: "codex_exec",
  cli_version: "0.144.5",
});
export const user = (text: string): string =>
  line("response_item", {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text }],
  });
export const assistant = (text: string, phase = "final_answer"): string =>
  line("response_item", {
    type: "message",
    role: "assistant",
    id: "msg_1",
    phase,
    content: [{ type: "output_text", text }],
  });

describe("parseRolloutEvents — messages and filtering", () => {
  it("maps user and assistant messages in file order; both phases render", () => {
    const doc = parseRolloutEvents(
      jsonl(
        META,
        user("add dark mode"),
        assistant("I'll start.", "commentary"),
        assistant("Done."),
      ),
    );
    expect(doc.events).toEqual([
      { kind: "user", text: "add dark mode" },
      { kind: "assistant", text: "I'll start." },
      { kind: "assistant", text: "Done." },
    ]);
    expect(doc.waitingReason).toBeNull();
  });

  it("filters injected-context user items and developer messages, keeps a real '<' prompt", () => {
    const doc = parseRolloutEvents(
      jsonl(
        META,
        user(
          "<environment_context>\n<cwd>/Users/me/proj</cwd>\n</environment_context>",
        ),
        user("<user_instructions>be terse</user_instructions>"),
        user("<recommended_plugins>foo</recommended_plugins>"),
        line("response_item", {
          type: "message",
          role: "developer",
          content: [
            { type: "input_text", text: "<permissions instructions>..." },
          ],
        }),
        user("<div> tags are broken on the landing page"),
      ),
    );
    expect(doc.events).toEqual([
      { kind: "user", text: "<div> tags are broken on the landing page" },
    ]);
  });

  it("never renders the event_msg echo stream (no doubled messages)", () => {
    const doc = parseRolloutEvents(
      jsonl(
        META,
        line("event_msg", {
          type: "user_message",
          message: "add dark mode",
          images: [],
        }),
        user("add dark mode"),
        assistant("On it."),
        line("event_msg", {
          type: "agent_message",
          message: "On it.",
          phase: "final_answer",
        }),
      ),
    );
    expect(doc.events).toHaveLength(2);
  });

  it("renders reasoning summaries as thinking; encrypted-only reasoning renders nothing", () => {
    const doc = parseRolloutEvents(
      jsonl(
        META,
        line("response_item", {
          type: "reasoning",
          id: "rs_1",
          summary: [{ type: "summary_text", text: "Weighing options" }],
          encrypted_content: "gAAAAA...",
        }),
        line("response_item", {
          type: "reasoning",
          id: "rs_2",
          summary: [],
          encrypted_content: "gAAAAB...",
        }),
      ),
    );
    expect(doc.events).toEqual([
      { kind: "thinking", text: "Weighing options" },
    ]);
  });

  it("tolerates malformed lines, unknown types, a mid-file forked session_meta, and empty input", () => {
    const doc = parseRolloutEvents(
      jsonl(
        META,
        "{ not json",
        line("turn_context", { cwd: "/x", model: "gpt-5.6-terra" }),
        line("world_state", { full: true, state: {} }),
        line("compacted", { message: "earlier work summarized" }),
        user("hello"),
        META, // forked files copy parent history, incl. its meta
        line("response_item", { type: "some_future_thing", data: 1 }),
      ),
    );
    expect(doc.events).toEqual([{ kind: "user", text: "hello" }]);
    expect(parseRolloutEvents("")).toEqual({
      events: [],
      waitingReason: null,
      turns: [],
      context: null,
    });
  });
});

describe("parseRolloutEvents — tool calls", () => {
  const CALL_ID = "call_Dvkk6kLG4eHO3puiocssk4xN";
  const execCall = line("response_item", {
    type: "custom_tool_call",
    id: "ctc_1",
    status: "completed",
    call_id: CALL_ID,
    name: "exec",
    input:
      'const r = await tools.exec_command({"cmd":"pwd && wc -l -- *.txt","workdir":"/tmp/probe","yield_time_ms":10000});\ntext(r.output);\n',
  });
  const execOut = line("response_item", {
    type: "custom_tool_call_output",
    call_id: CALL_ID,
    output: [
      {
        type: "input_text",
        text: "Script completed\nWall time 1.4 seconds\nOutput:\n",
      },
      { type: "input_text", text: "/tmp/probe\n5 total\n" },
    ],
  });

  it("renders a custom exec call with the extracted command and back-patched output", () => {
    const doc = parseRolloutEvents(jsonl(execCall, execOut));
    expect(doc.events).toEqual([
      {
        kind: "tool",
        name: "exec",
        input: "pwd && wc -l -- *.txt",
        toolUseId: CALL_ID,
        status: "ok",
        outputLines: 6,
      },
    ]);
  });

  it("falls back to the raw script when no exec_command args parse", () => {
    const doc = parseRolloutEvents(
      jsonl(
        line("response_item", {
          type: "custom_tool_call",
          call_id: "call_x",
          name: "exec",
          input: "console.log('no harness call here')",
        }),
      ),
    );
    expect(doc.events[0]).toMatchObject({
      kind: "tool",
      name: "exec",
      input: "console.log('no harness call here')",
      status: "pending",
      outputLines: 0,
    });
  });

  it("renders a classic function_call shell command; exit_code wrapper sets ok/error", () => {
    const call = (id: string) =>
      line("response_item", {
        type: "function_call",
        name: "shell",
        arguments: '{"command":["bash","-lc","ls"]}',
        call_id: id,
      });
    const out = (id: string, exit: number) =>
      line("response_item", {
        type: "function_call_output",
        call_id: id,
        output: JSON.stringify({
          output: "a.txt\nb.txt\n",
          metadata: { exit_code: exit, duration_seconds: 0.1 },
        }),
      });
    const doc = parseRolloutEvents(
      jsonl(
        call("call_ok"),
        out("call_ok", 0),
        call("call_bad"),
        out("call_bad", 1),
      ),
    );
    expect(doc.events[0]).toMatchObject({
      name: "shell",
      input: "bash -lc ls",
      status: "ok",
      outputLines: 2,
    });
    expect(doc.events[1]).toMatchObject({ status: "error", outputLines: 2 });
  });

  it("accepts a plain-string output and ignores orphan outputs", () => {
    const doc = parseRolloutEvents(
      jsonl(
        line("response_item", {
          type: "function_call",
          name: "shell",
          arguments: '{"command":["pwd"]}',
          call_id: "call_1",
        }),
        line("response_item", {
          type: "function_call_output",
          call_id: "call_1",
          output: "/tmp/probe\n",
        }),
        line("response_item", {
          type: "function_call_output",
          call_id: "call_orphan",
          output: "lost",
        }),
      ),
    );
    expect(doc.events).toEqual([
      {
        kind: "tool",
        name: "shell",
        input: "pwd",
        toolUseId: "call_1",
        status: "ok",
        outputLines: 1,
      },
    ]);
  });

  it("renders local_shell_call and web_search_call rows", () => {
    const doc = parseRolloutEvents(
      jsonl(
        line("response_item", {
          type: "local_shell_call",
          call_id: "call_ls",
          status: "completed",
          action: { type: "exec", command: ["cat", "notes.md"] },
        }),
        line("response_item", {
          type: "web_search_call",
          id: "ws_1",
          status: "completed",
          action: { type: "search", query: "electron vitest" },
        }),
      ),
    );
    expect(doc.events[0]).toMatchObject({
      kind: "tool",
      name: "shell",
      input: "cat notes.md",
      toolUseId: "call_ls",
    });
    expect(doc.events[1]).toMatchObject({
      kind: "tool",
      name: "web_search",
      input: '{"type":"search","query":"electron vitest"}',
      toolUseId: "",
    });
  });
});
