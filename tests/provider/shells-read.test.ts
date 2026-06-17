import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClaudeProvider } from "../../src/main/provider/claude";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-shells-");

function writeTranscript(claudeDir: string, id: string, rows: unknown[]): void {
  const projDir = join(claudeDir, "projects", "proj");
  mkdirSync(projDir, { recursive: true });
  writeFileSync(
    join(projDir, `${id}.jsonl`),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
}

const shellRows = (id: string, tuid: string, taskId: string) => [
  {
    type: "assistant",
    sessionId: id,
    timestamp: "2026-06-11T00:00:00.000Z",
    message: {
      id: "m1",
      content: [
        {
          type: "tool_use",
          id: tuid,
          name: "Bash",
          input: { command: "pnpm dev", run_in_background: true },
        },
      ],
    },
  },
  {
    type: "user",
    sessionId: id,
    timestamp: "2026-06-11T00:00:01.000Z",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: tuid,
          content: `Command running in background with ID: ${taskId}. Output is being written to: /tmp/t/${taskId}.output`,
        },
      ],
    },
    toolUseResult: { backgroundTaskId: taskId },
  },
];

describe.skipIf(process.platform === "win32")("provider.readShells", () => {
  it("lists the session's background shells without the output path", () => {
    const claudeDir = makeHome();
    writeTranscript(claudeDir, "s1", shellRows("s1", "t1", "bg1"));
    const r = createClaudeProvider({ claudeDir }).readShells("s1");
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.shells).toHaveLength(1);
    expect(r.shells[0].id).toBe("bg1");
    expect(r.shells[0].command).toBe("pnpm dev");
    expect("outputFile" in r.shells[0]).toBe(false);
  });

  it("returns changed-with-empty for a transcript that spawned no shells", () => {
    const claudeDir = makeHome();
    writeTranscript(claudeDir, "s2", [
      {
        type: "user",
        timestamp: "2026-06-11T00:00:00.000Z",
        message: { content: "hi" },
      },
    ]);
    const r = createClaudeProvider({ claudeDir }).readShells("s2");
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.shells).toEqual([]);
  });

  it("dedupes on the transcript mtime", () => {
    const claudeDir = makeHome();
    writeTranscript(claudeDir, "s1", shellRows("s1", "t1", "bg1"));
    const p = createClaudeProvider({ claudeDir });
    const first = p.readShells("s1");
    if (first.status !== "changed") throw new Error("expected changed");
    expect(p.readShells("s1", first.mtimeMs).status).toBe("unchanged");
  });

  it("is absent for an unknown session", () => {
    const claudeDir = makeHome();
    expect(createClaudeProvider({ claudeDir }).readShells("nope").status).toBe(
      "absent",
    );
  });
});

describe.skipIf(process.platform === "win32")(
  "provider.readShellOutput",
  () => {
    it("reads the live .output file and labels the source", () => {
      const claudeDir = makeHome();
      const out = join(makeHome(), "bg1.output");
      writeFileSync(out, "VITE ready\nLocal: http://localhost:5173/\n");
      writeTranscript(claudeDir, "s1", [
        {
          type: "assistant",
          timestamp: "2026-06-11T00:00:00.000Z",
          message: {
            id: "m1",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "pnpm dev", run_in_background: true },
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
                tool_use_id: "t1",
                content: `Command running in background with ID: bg1. Output is being written to: ${out}`,
              },
            ],
          },
          toolUseResult: { backgroundTaskId: "bg1" },
        },
      ]);
      const r = createClaudeProvider({ claudeDir }).readShellOutput(
        "s1",
        "bg1",
      );
      expect(r.status).toBe("changed");
      if (r.status !== "changed") return;
      expect(r.output.source).toBe("live");
      expect(r.output.text).toContain("localhost:5173");
      expect(r.output.truncatedBytes).toBe(0);
    });

    it("dedupes on the .output file mtime", () => {
      const claudeDir = makeHome();
      const out = join(makeHome(), "bg1.output");
      writeFileSync(out, "x\n");
      writeTranscript(claudeDir, "s1", [
        {
          type: "assistant",
          timestamp: "2026-06-11T00:00:00.000Z",
          message: {
            id: "m1",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "c", run_in_background: true },
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
                tool_use_id: "t1",
                content: `Command running in background with ID: bg1. Output is being written to: ${out}`,
              },
            ],
          },
          toolUseResult: { backgroundTaskId: "bg1" },
        },
      ]);
      const p = createClaudeProvider({ claudeDir });
      const first = p.readShellOutput("s1", "bg1");
      if (first.status !== "changed") throw new Error("expected changed");
      expect(p.readShellOutput("s1", "bg1", first.mtimeMs).status).toBe(
        "unchanged",
      );
    });

    it("falls back to stitched snapshots when the file is gone", () => {
      const claudeDir = makeHome();
      writeTranscript(claudeDir, "s1", [
        {
          type: "assistant",
          timestamp: "2026-06-11T00:00:00.000Z",
          message: {
            id: "m1",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "c", run_in_background: true },
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
                tool_use_id: "t1",
                content:
                  "Command running in background with ID: bg1. Output is being written to: /tmp/gone/bg1.output",
              },
            ],
          },
          toolUseResult: { backgroundTaskId: "bg1" },
        },
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "p1",
                name: "TaskOutput",
                input: { task_id: "bg1" },
              },
            ],
          },
        },
        {
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "p1",
                content: "snap chunk\n",
              },
            ],
          },
        },
      ]);
      const r = createClaudeProvider({ claudeDir }).readShellOutput(
        "s1",
        "bg1",
      );
      expect(r.status).toBe("changed");
      if (r.status !== "changed") return;
      expect(r.output.source).toBe("snapshot");
      expect(r.output.text).toBe("snap chunk\n");
    });

    it("rejects a shellId with a path separator, and an unknown shell", () => {
      const claudeDir = makeHome();
      writeTranscript(claudeDir, "s1", shellRows("s1", "t1", "bg1"));
      const p = createClaudeProvider({ claudeDir });
      expect(p.readShellOutput("s1", "../etc/passwd").status).toBe("absent");
      expect(p.readShellOutput("s1", "nope").status).toBe("absent");
    });
  },
);
