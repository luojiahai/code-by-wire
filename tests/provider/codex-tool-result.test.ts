import { describe, it, expect } from "vitest";
import { extractToolResult } from "../../src/main/provider/codex/tool-result";

const line = (payload: unknown): string =>
  JSON.stringify({
    timestamp: "2026-07-19T08:37:21.000Z",
    type: "response_item",
    payload,
  });

const CALL = line({
  type: "custom_tool_call",
  call_id: "call_1",
  name: "exec",
  input: 'await tools.exec_command({"cmd":"pwd && ls","workdir":"/tmp"});',
});
const OUT = line({
  type: "custom_tool_call_output",
  call_id: "call_1",
  output: [{ type: "input_text", text: "/tmp\na.txt\n" }],
});

describe("extractToolResult", () => {
  it("finds the full command and output by call_id", () => {
    expect(extractToolResult([CALL, OUT].join("\n"), "call_1")).toEqual({
      found: true,
      command: "pwd && ls",
      output: "/tmp\na.txt\n",
      status: "ok",
    });
  });

  it("maps a non-zero exit_code wrapper to error", () => {
    const call = line({
      type: "function_call",
      name: "shell",
      arguments: '{"command":["bash","-lc","false"]}',
      call_id: "call_2",
    });
    const out = line({
      type: "function_call_output",
      call_id: "call_2",
      output: JSON.stringify({ output: "boom\n", metadata: { exit_code: 1 } }),
    });
    expect(extractToolResult([call, out].join("\n"), "call_2")).toEqual({
      found: true,
      command: "bash -lc false",
      output: "boom\n",
      status: "error",
    });
  });

  it("is pending while the output has not landed", () => {
    expect(extractToolResult(CALL, "call_1")).toEqual({
      found: true,
      command: "pwd && ls",
      output: "",
      status: "pending",
    });
  });

  it("is not found for an unknown or empty id, and survives junk lines", () => {
    expect(extractToolResult([CALL, OUT].join("\n"), "call_nope")).toEqual({
      found: false,
    });
    expect(extractToolResult("{ not json", "call_1")).toEqual({
      found: false,
    });
    // A non-empty, non-matching id drives the malformed line through the
    // try/catch (an empty id would short-circuit before parsing anything).
    expect(extractToolResult("{ not json\n" + CALL, "call_junk")).toEqual({
      found: false,
    });
  });
});
