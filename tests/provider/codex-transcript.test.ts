import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRolloutRows } from "../../src/main/provider/codex/rollout";
import {
  extractRolloutToolResult,
  parseRolloutEvents,
} from "../../src/main/provider/codex/events";
import {
  firstRolloutCwd,
  parseRolloutSummary,
} from "../../src/main/provider/codex/summary";

const FIXTURE = resolve(
  "tests/fixtures/codex-home/sessions/2026/07/10",
  "rollout-2026-07-10T10-00-00-cccc1111-1111-4111-8111-111111111111.jsonl",
);
const jsonl = readFileSync(FIXTURE, "utf8");

describe("codex rollout events", () => {
  const doc = parseRolloutEvents(parseRolloutRows(jsonl));

  it("renders user/assistant/thinking/tool/diff rows and filters injected noise", () => {
    expect(doc.events.map((e) => e.kind)).toEqual([
      "user", // the real prompt — developer preamble + AGENTS.md/env injections all filtered
      "thinking", // the reasoning summary (the encrypted body is not renderable)
      "tool", // exec_command
      "diff", // apply_patch
      "assistant",
      "user",
      "tool",
      "assistant",
    ]);
    expect(doc.events[0]).toEqual({
      kind: "user",
      text: "Add a health endpoint to the demo server",
    });
    expect(doc.events[1]).toEqual({
      kind: "thinking",
      text: "Scanning the server entry point first.",
    });
    // No duplicate assistant rows off the event_msg agent_message mirror.
    expect(
      doc.events.filter(
        (e) =>
          e.kind === "assistant" &&
          e.text === "Added a /health route returning 200.",
      ),
    ).toHaveLength(1);
  });

  it("summarizes tool calls and back-patches status + output lines from the call output", () => {
    const [ok, failed] = doc.events.filter((e) => e.kind === "tool");
    expect(ok).toMatchObject({
      name: "exec_command",
      input: "ls src",
      toolUseId: "call_demo_1",
      status: "ok",
      outputLines: 4,
    });
    // "Process exited with code 1" is the only failure signal a rollout carries.
    expect(failed).toMatchObject({ input: "false", status: "error" });
  });

  it("maps apply_patch to a diff event with the patched file and hunk", () => {
    const diff = doc.events.find((e) => e.kind === "diff");
    expect(diff).toMatchObject({
      tool: "apply_patch",
      file: "/Users/tester/demo-app/src/server.ts",
      status: "ok",
      hunk: {
        removed: ["const routes = base;"],
        added: ["const routes = withHealth(base);"],
      },
    });
  });

  it("builds the turn timeline from real user prompts", () => {
    expect(doc.turns).toHaveLength(2);
    expect(doc.turns[0]).toMatchObject({
      index: 1,
      prompt: "Add a health endpoint to the demo server",
      toolCount: 2,
    });
    expect(doc.turns[0].durationMs).toBeGreaterThan(0);
    expect(doc.turns[1]).toMatchObject({ index: 2, toolCount: 1 });
  });

  it("derives the context split from the newest token_count (cached kept disjoint)", () => {
    expect(doc.context).toEqual({
      input: 1000,
      cacheRead: 4000,
      cacheCreation: 0,
    });
    // Observe-only: no honest blocked-on-user signal exists, so nothing claims to be waiting.
    expect(doc.waitingReason).toBeNull();
  });

  it("tolerates the half-written trailing line (an append in progress)", () => {
    // The fixture ends mid-JSON; parsing anything at all proves the tolerance, but pin the row
    // count so a silently-dropped *valid* line would fail too.
    expect(parseRolloutRows(jsonl)).toHaveLength(19);
  });
});

describe("codex tool result extraction", () => {
  const rows = parseRolloutRows(jsonl);

  it("returns the full command and output by call id", () => {
    const detail = extractRolloutToolResult(rows, "call_demo_1");
    expect(detail).toMatchObject({ found: true, status: "ok" });
    if (!detail.found) return;
    expect(detail.command).toContain("ls src");
    expect(detail.output).toContain("server.ts");
  });

  it("reads a non-zero exit code as error and a missing id as not found", () => {
    expect(extractRolloutToolResult(rows, "call_demo_3")).toMatchObject({
      found: true,
      status: "error",
    });
    expect(extractRolloutToolResult(rows, "call_nope")).toEqual({
      found: false,
    });
    expect(extractRolloutToolResult(rows, "")).toEqual({ found: false });
  });
});

describe("codex rollout summary", () => {
  const summary = parseRolloutSummary(jsonl);

  it("reads identity from session_meta and the newest turn_context", () => {
    expect(summary.cwd).toBe("/Users/tester/demo-app");
    expect(summary.branch).toBe("main");
    expect(summary.modelRaw).toBe("gpt-5.5");
    expect(summary.effortLevel).toBe("high");
    expect(summary.firstPrompt).toBe(
      "Add a health endpoint to the demo server",
    );
    expect(summary.createdMs).toBe(Date.parse("2026-07-10T02:00:00.000Z"));
    expect(summary.lastActivityMs).toBe(Date.parse("2026-07-10T02:03:00.500Z"));
  });

  it("maps the cumulative token_count into the app's Usage shape (cached subtracted from input)", () => {
    expect(summary.usage).toMatchObject({
      inputTokens: 1000,
      outputTokens: 250,
      cacheReadTokens: 4000,
      cacheCreationTokens: 0,
    });
    expect(summary.contextTokens).toBe(5000); // the last request's full prompt
    expect(summary.contextWindow).toBe(272000); // the model's real window, not a family default
  });

  it("resolves the cwd from the head without a full parse", () => {
    expect(firstRolloutCwd(jsonl)).toBe("/Users/tester/demo-app");
    expect(firstRolloutCwd('{"no":"cwd"}\n')).toBe("");
  });
});
