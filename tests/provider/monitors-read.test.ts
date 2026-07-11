import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClaudeProvider } from "../../src/main/provider/claude";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-monitors-");

function writeTranscript(claudeDir: string, id: string, rows: unknown[]): void {
  const projDir = join(claudeDir, "projects", "proj");
  mkdirSync(projDir, { recursive: true });
  writeFileSync(
    join(projDir, `${id}.jsonl`),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
}

/** A Monitor start pair (tool_use + start tool_result), optionally with a terminal notification. */
const monitorRows = (
  id: string,
  tuid: string,
  taskId: string,
  outputFile?: string,
) => {
  const rows: unknown[] = [
    {
      type: "assistant",
      timestamp: "2026-06-11T00:00:00.000Z",
      message: {
        id: "m1",
        content: [
          {
            type: "tool_use",
            id: tuid,
            name: "Monitor",
            input: { command: "until … done" },
          },
        ],
      },
    },
    {
      type: "user",
      timestamp: "2026-06-11T00:00:01.000Z",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: tuid,
            content: `Monitor started (task ${taskId}, timeout 300000ms).`,
          },
        ],
      },
      toolUseResult: { taskId, timeoutMs: 300000, persistent: false },
    },
  ];
  if (outputFile) {
    rows.push({
      type: "attachment",
      timestamp: "2026-06-11T00:00:09.000Z",
      attachment: {
        commandMode: "task-notification",
        prompt: `<task-notification>\n<task-id>${taskId}</task-id>\n<output-file>${outputFile}</output-file>\n<status>completed</status>\n<summary>stream ended</summary>\n</task-notification>`,
      },
    });
  }
  return rows;
};

/** An event notification row (feeds the stitched fallback). */
const eventRow = (taskId: string, event: string) => ({
  type: "attachment",
  timestamp: "2026-06-11T00:00:05.000Z",
  attachment: {
    commandMode: "task-notification",
    prompt: `<task-notification>\n<task-id>${taskId}</task-id>\n<summary>Monitor event: "w"</summary>\n<event>${event}</event>\n</task-notification>`,
  },
});

describe("provider.readMonitors", () => {
  it("lists the session's monitors without the output path", () => {
    const claudeDir = makeHome();
    writeTranscript(claudeDir, "s1", monitorRows("s1", "t1", "b1"));
    const r = createClaudeProvider({ claudeDir }).readMonitors("s1");
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.monitors).toHaveLength(1);
    expect(r.monitors[0].id).toBe("b1");
    expect(r.monitors[0].command).toBe("until … done");
    expect("outputFile" in r.monitors[0]).toBe(false);
  });

  it("returns changed-with-empty for a transcript with no monitors", () => {
    const claudeDir = makeHome();
    writeTranscript(claudeDir, "s2", [
      {
        type: "user",
        timestamp: "2026-06-11T00:00:00.000Z",
        message: { content: "hi" },
      },
    ]);
    const r = createClaudeProvider({ claudeDir }).readMonitors("s2");
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.monitors).toEqual([]);
  });

  it("dedupes on the transcript mtime", () => {
    const claudeDir = makeHome();
    writeTranscript(claudeDir, "s1", monitorRows("s1", "t1", "b1"));
    const p = createClaudeProvider({ claudeDir });
    const first = p.readMonitors("s1");
    if (first.status !== "changed") throw new Error("expected changed");
    expect(p.readMonitors("s1", first.mtimeMs).status).toBe("unchanged");
  });

  it("is absent for an unknown session", () => {
    const claudeDir = makeHome();
    expect(
      createClaudeProvider({ claudeDir }).readMonitors("nope").status,
    ).toBe("absent");
  });
});

describe("provider.readMonitorOutput", () => {
  it("reads the authoritative .output file and labels the source live", () => {
    const claudeDir = makeHome();
    const out = join(makeHome(), "b1.output");
    writeFileSync(out, "draft: success\nRUN_COMPLETED: success\n");
    writeTranscript(claudeDir, "s1", monitorRows("s1", "t1", "b1", out));
    const r = createClaudeProvider({ claudeDir }).readMonitorOutput("s1", "b1");
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.output.source).toBe("live");
    expect(r.output.text).toContain("RUN_COMPLETED");
  });

  it("falls back to stitched events when there is no output file (running monitor)", () => {
    const claudeDir = makeHome();
    writeTranscript(claudeDir, "s1", [
      ...monitorRows("s1", "t1", "b1"),
      eventRow("b1", "draft: success"),
    ]);
    const r = createClaudeProvider({ claudeDir }).readMonitorOutput("s1", "b1");
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.output.source).toBe("snapshot");
    expect(r.output.text).toBe("draft: success");
  });

  it("rejects a monitorId with a path separator, and an unknown monitor", () => {
    const claudeDir = makeHome();
    writeTranscript(claudeDir, "s1", monitorRows("s1", "t1", "b1"));
    const p = createClaudeProvider({ claudeDir });
    expect(p.readMonitorOutput("s1", "../etc/passwd").status).toBe("absent");
    expect(p.readMonitorOutput("s1", "nope").status).toBe("absent");
  });
});
