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
