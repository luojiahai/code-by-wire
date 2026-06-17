// tests/provider/shells.test.ts
import { describe, it, expect } from "vitest";
import {
  reconstructShells,
  tailOutput,
  stitchSnapshots,
} from "../../src/main/provider/claude/shells";

const TASKS = "/tmp/claude/proj/sess/tasks";

/** A Bash tool_use (assistant row) that requests backgrounding. */
const bashUse = (
  tuid: string,
  command: string,
  opts: { description?: string } = {},
) => ({
  type: "assistant",
  timestamp: "2026-06-11T00:00:00.000Z",
  message: {
    id: `m-${tuid}`,
    content: [
      {
        type: "tool_use",
        id: tuid,
        name: "Bash",
        input: { command, run_in_background: true, ...opts },
      },
    ],
  },
});

/** The background-start tool_result (user row) carrying backgroundTaskId + the output path in its text. */
const startResult = (
  tuid: string,
  id: string,
  ts: string,
  extra: Record<string, unknown> = {},
) => ({
  type: "user",
  timestamp: ts,
  message: {
    content: [
      {
        type: "tool_result",
        tool_use_id: tuid,
        is_error: false,
        content: `Command running in background with ID: ${id}. Output is being written to: ${TASKS}/${id}.output`,
      },
    ],
  },
  toolUseResult: { backgroundTaskId: id, ...extra },
});

/** A completion task-notification (queue-operation row). */
const notification = (
  id: string,
  tuid: string,
  ts: string,
  summary: string,
  status = "completed",
) => ({
  type: "queue-operation",
  operation: "enqueue",
  timestamp: ts,
  content: `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>${tuid}</tool-use-id>\n<output-file>${TASKS}/${id}.output</output-file>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`,
});

describe("reconstructShells", () => {
  it("detects a running shell (start, no notification yet)", () => {
    const rows = [
      bashUse("t1", "pnpm dev", { description: "dev server" }),
      startResult("t1", "bg1", "2026-06-11T00:00:01.000Z"),
    ];
    expect(reconstructShells(rows)).toEqual([
      {
        id: "bg1",
        command: "pnpm dev",
        description: "dev server",
        status: "running",
        startMs: Date.parse("2026-06-11T00:00:01.000Z"),
        trigger: "explicit",
        outputFile: `${TASKS}/bg1.output`,
      },
    ]);
  });

  it("derives completed + exit code 0 and duration from the notification", () => {
    const rows = [
      bashUse("t1", "pnpm build", { description: "build" }),
      startResult("t1", "bg1", "2026-06-11T00:00:01.000Z"),
      notification(
        "bg1",
        "t1",
        "2026-06-11T00:00:13.000Z",
        'Background command "build" completed (exit code 0)',
      ),
    ];
    const [s] = reconstructShells(rows);
    expect(s.status).toBe("completed");
    expect(s.exitCode).toBe(0);
    expect(s.durationMs).toBe(12_000);
  });

  it("reads a non-zero exit code (the row will render as failed)", () => {
    const rows = [
      bashUse("t1", "./migrate.sh"),
      startResult("t1", "bg1", "2026-06-11T00:00:01.000Z"),
      notification(
        "bg1",
        "t1",
        "2026-06-11T00:00:05.000Z",
        'Background command "migrate" completed (exit code 1)',
      ),
    ];
    const [s] = reconstructShells(rows);
    expect(s.status).toBe("completed");
    expect(s.exitCode).toBe(1);
  });

  it("detects the assistant-auto-background and Ctrl+B triggers", () => {
    const auto = reconstructShells([
      bashUse("t1", "a"),
      startResult("t1", "bg1", "2026-06-11T00:00:01.000Z", {
        assistantAutoBackgrounded: true,
      }),
    ]);
    expect(auto[0].trigger).toBe("auto");
    const user = reconstructShells([
      bashUse("t2", "b"),
      startResult("t2", "bg2", "2026-06-11T00:00:01.000Z", {
        backgroundedByUser: true,
      }),
    ]);
    expect(user[0].trigger).toBe("user");
  });

  it("marks a shell killed when a KillShell/TaskStop references it with no completion", () => {
    const rows = [
      bashUse("t1", "tail -f log"),
      startResult("t1", "bg1", "2026-06-11T00:00:01.000Z"),
      {
        type: "assistant",
        timestamp: "2026-06-11T00:00:09.000Z",
        message: {
          id: "mk",
          content: [
            {
              type: "tool_use",
              id: "k1",
              name: "KillShell",
              input: { shell_id: "bg1" },
            },
          ],
        },
      },
    ];
    expect(reconstructShells(rows)[0].status).toBe("killed");
  });

  it("orders shells by start time", () => {
    const rows = [
      bashUse("t1", "first"),
      bashUse("t2", "second"),
      startResult("t2", "bg2", "2026-06-11T00:00:05.000Z"),
      startResult("t1", "bg1", "2026-06-11T00:00:01.000Z"),
    ];
    expect(reconstructShells(rows).map((s) => s.id)).toEqual(["bg1", "bg2"]);
  });

  it("never treats a subagent as a shell (no backgroundTaskId on its dispatch)", () => {
    const rows = [
      {
        type: "assistant",
        timestamp: "2026-06-11T00:00:00.000Z",
        message: {
          id: "m1",
          content: [
            {
              type: "tool_use",
              id: "a1",
              name: "Task",
              input: { description: "explore" },
            },
          ],
        },
      },
      notification(
        "sub-1",
        "a1",
        "2026-06-11T00:00:30.000Z",
        'Agent "explore" completed',
      ),
    ];
    expect(reconstructShells(rows)).toEqual([]);
  });
});

describe("tailOutput", () => {
  it("returns the text unchanged when under the byte cap", () => {
    expect(tailOutput("hello", 1024)).toEqual({
      text: "hello",
      truncatedBytes: 0,
    });
  });

  it("keeps the last maxBytes and reports the dropped count", () => {
    const r = tailOutput("abcdefghij", 4);
    expect(r.text).toBe("ghij");
    expect(r.truncatedBytes).toBe(6);
  });
});

describe("stitchSnapshots", () => {
  it("concatenates BashOutput/TaskOutput tool_result chunks for the shell, in order", () => {
    const poll = (tuid: string, id: string, chunk: string) => [
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: tuid,
              name: "TaskOutput",
              input: { task_id: id },
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [{ type: "tool_result", tool_use_id: tuid, content: chunk }],
        },
      },
    ];
    const rows = [
      ...poll("p1", "bg1", "line one\n"),
      ...poll("p2", "bg1", "line two\n"),
      ...poll("p3", "bg9", "other\n"),
    ];
    expect(stitchSnapshots(rows, "bg1")).toBe("line one\nline two\n");
  });
});
