import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectReferencedAgentIds,
  listSessionSubagentFiles,
} from "../../src/main/provider/claude/subagents";

const row = (o: object): string => JSON.stringify(o) + "\n";

describe("collectReferencedAgentIds", () => {
  it("deep-walks rows for agentId strings at any depth", () => {
    const jsonl =
      row({ type: "assistant", toolUseResult: { agentId: "a1" } }) +
      row({ nested: [{ deeper: { agentId: "b2" } }] }) +
      row({ agentId: "" }) + // empty ignored
      row({ agentid: "wrong-case" }); // key is case-sensitive
    expect(collectReferencedAgentIds(jsonl)).toEqual(new Set(["a1", "b2"]));
  });
});

describe("listSessionSubagentFiles", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function fixture(): { main: string } {
    dir = mkdtempSync(join(tmpdir(), "cbw-sub-"));
    const main = join(dir, "sid.jsonl");
    writeFileSync(main, row({ agentId: "a1" }));
    // per-session layout — owned by the session, unguarded
    mkdirSync(join(dir, "sid", "subagents"), { recursive: true });
    writeFileSync(join(dir, "sid", "subagents", "agent-own.jsonl"), "");
    // flat layout — SHARED across the project dir, guarded by references
    mkdirSync(join(dir, "subagents"), { recursive: true });
    writeFileSync(join(dir, "subagents", "agent-a1.jsonl"), "");
    writeFileSync(join(dir, "subagents", "agent-other.jsonl"), "");
    return { main };
  }

  it("per-session files always count; flat files only when referenced", () => {
    const { main } = fixture();
    const files = listSessionSubagentFiles(main, "sid", () => new Set(["a1"]));
    const names = files.map((f) => f.name).sort();
    expect(names).toEqual(["agent-a1.jsonl", "agent-own.jsonl"]);
  });

  it("an empty reference set still discovers the per-session layout", () => {
    const { main } = fixture();
    const files = listSessionSubagentFiles(main, "sid", () => new Set());
    expect(files.map((f) => f.name)).toEqual(["agent-own.jsonl"]);
  });

  it("the thunk is not invoked when no flat-layout files exist", () => {
    dir = mkdtempSync(join(tmpdir(), "cbw-sub-"));
    const main = join(dir, "sid.jsonl");
    writeFileSync(main, "");
    let called = false;
    listSessionSubagentFiles(main, "sid", () => ((called = true), new Set()));
    expect(called).toBe(false);
  });
});
