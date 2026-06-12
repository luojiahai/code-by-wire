import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClaudeProvider } from "../../src/main/provider/claude";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-rt-");
const jsonl = (...rows: object[]) =>
  rows.map((r) => JSON.stringify(r)).join("\n");

function writeMain(home: string, proj: string, id: string, body: string): void {
  const dir = join(home, "projects", proj);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.jsonl`), body);
}
function writeSubagent(
  home: string,
  proj: string,
  id: string,
  agentId: string,
  meta: object,
  body: string,
): void {
  const dir = join(home, "projects", proj, id, "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `agent-${agentId}.meta.json`), JSON.stringify(meta));
  writeFileSync(join(dir, `agent-${agentId}.jsonl`), body);
}

describe("readTranscript — subagents", () => {
  it("attaches the reconstructed forest from the subagents dir", () => {
    const home = makeHome();
    const id = "sid-1";
    writeMain(
      home,
      "-work-x",
      id,
      jsonl(
        {
          type: "assistant",
          message: {
            content: [{ type: "tool_use", id: "tu-1", name: "Task" }],
          },
        },
        {
          type: "user",
          message: {
            content: [
              { type: "tool_result", tool_use_id: "tu-1", is_error: false },
            ],
          },
        },
      ),
    );
    writeSubagent(
      home,
      "-work-x",
      id,
      "a1",
      { agentType: "Explore", description: "d", toolUseId: "tu-1" },
      jsonl(
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:00.000Z",
          message: {
            model: "global.anthropic.claude-sonnet-4-6",
            usage: { input_tokens: 4, output_tokens: 20 },
            content: [],
          },
        },
        {
          type: "assistant",
          timestamp: "2026-06-04T03:00:04.000Z",
          message: {
            model: "global.anthropic.claude-sonnet-4-6",
            usage: { input_tokens: 1, output_tokens: 5 },
            content: [],
          },
        },
      ),
    );

    const provider = createClaudeProvider({ claudeDir: home });
    const r = provider.readTranscript(id);
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.doc.subagents).toEqual([
      {
        id: "a1",
        type: "Explore",
        status: "done",
        model: "claude-sonnet-4-6",
        tokens: 30,
        durationMs: 4000,
      },
    ]);
    // Echoing the token back yields unchanged.
    expect(provider.readTranscript(id, r.mtimeMs).status).toBe("unchanged");
  });

  it("returns an empty forest when there is no subagents dir", () => {
    const home = makeHome();
    writeMain(
      home,
      "-work-y",
      "sid-2",
      jsonl({
        type: "assistant",
        message: { content: [{ type: "text", text: "hi" }] },
      }),
    );
    const r = createClaudeProvider({ claudeDir: home }).readTranscript("sid-2");
    expect(r.status === "changed" && r.doc.subagents).toEqual([]);
  });
});
