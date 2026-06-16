import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClaudeProvider } from "../../src/main/provider/claude";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-rst-");
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
  // The meta mirrors the real on-disk layout; readSubagentTranscript reads only the .jsonl.
  writeFileSync(join(dir, `agent-${agentId}.meta.json`), JSON.stringify(meta));
  writeFileSync(join(dir, `agent-${agentId}.jsonl`), body);
}

describe("readSubagentTranscript", () => {
  it("parses a subagent's sidechain file into a rendered doc", () => {
    const home = makeHome();
    const id = "sid-1";
    writeMain(
      home,
      "-work-x",
      id,
      jsonl({
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "tu-1", name: "Task" }] },
      }),
    );
    writeSubagent(
      home,
      "-work-x",
      id,
      "a1",
      { agentType: "Explore", description: "d", toolUseId: "tu-1" },
      jsonl(
        {
          type: "user",
          isSidechain: true,
          isMeta: false,
          message: { role: "user", content: "Find the seam" },
        },
        {
          type: "assistant",
          isSidechain: true,
          timestamp: "2026-06-04T03:00:00.000Z",
          message: {
            model: "global.anthropic.claude-sonnet-4-6",
            content: [{ type: "text", text: "Found it." }],
          },
        },
      ),
    );

    const provider = createClaudeProvider({ claudeDir: home });
    const r = provider.readSubagentTranscript(id, "a1");
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.doc.events).toEqual([
      { kind: "user", text: "Find the seam" },
      { kind: "assistant", text: "Found it." },
    ]);
    expect(r.doc.subagents).toEqual([]);
    // Echoing the token back yields unchanged.
    expect(provider.readSubagentTranscript(id, "a1", r.mtimeMs).status).toBe(
      "unchanged",
    );
  });

  it("returns absent for an unknown agent id", () => {
    const home = makeHome();
    const id = "sid-2";
    writeMain(
      home,
      "-work-y",
      id,
      jsonl({
        type: "assistant",
        message: { content: [{ type: "text", text: "hi" }] },
      }),
    );
    const provider = createClaudeProvider({ claudeDir: home });
    expect(provider.readSubagentTranscript(id, "nope").status).toBe("absent");
  });

  it("returns absent when the agent file is missing though the subagents dir exists", () => {
    const home = makeHome();
    const id = "sid-3";
    writeMain(
      home,
      "-work-z",
      id,
      jsonl({
        type: "assistant",
        message: { content: [{ type: "text", text: "hi" }] },
      }),
    );
    // A sibling subagent exists, so the subagents dir is present — but not the one we ask for.
    writeSubagent(
      home,
      "-work-z",
      id,
      "sibling",
      { agentType: "Explore", description: "d", toolUseId: "tu-x" },
      jsonl({
        type: "assistant",
        isSidechain: true,
        message: { content: [{ type: "text", text: "hi" }] },
      }),
    );
    const provider = createClaudeProvider({ claudeDir: home });
    expect(provider.readSubagentTranscript(id, "missing").status).toBe(
      "absent",
    );
  });

  it("returns absent when the session has no transcript", () => {
    const home = makeHome();
    const provider = createClaudeProvider({ claudeDir: home });
    expect(provider.readSubagentTranscript("ghost", "a1").status).toBe(
      "absent",
    );
  });

  it("rejects a traversal agentId instead of reading a file outside the subagents dir", () => {
    const home = makeHome();
    const id = "sid-4";
    writeMain(
      home,
      "-work-w",
      id,
      jsonl({
        type: "assistant",
        message: { content: [{ type: "text", text: "hi" }] },
      }),
    );
    // Plant a real .jsonl one level above the subagents dir. Without the separator guard, an agentId of
    // `x/../../evil` resolves `<subagents>/agent-x/../../evil.jsonl` to this file and would read it.
    mkdirSync(join(home, "projects", "-work-w", id), { recursive: true });
    writeFileSync(
      join(home, "projects", "-work-w", id, "evil.jsonl"),
      jsonl({
        type: "assistant",
        isSidechain: true,
        message: { content: [{ type: "text", text: "secret" }] },
      }),
    );
    const provider = createClaudeProvider({ claudeDir: home });
    expect(provider.readSubagentTranscript(id, "x/../../evil").status).toBe(
      "absent",
    );
  });
});
