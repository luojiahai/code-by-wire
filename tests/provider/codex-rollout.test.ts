import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseRolloutFilename,
  parseRolloutHead,
  listRollouts,
  readRolloutHead,
} from "../../src/main/provider/codex/rollout";
import { resolveCodexDir } from "../../src/main/provider/codex/config";

const META =
  '{"timestamp":"2026-07-18T10:30:01.000Z","type":"session_meta","payload":{"id":"11111111-2222-3333-4444-555555555555","timestamp":"2026-07-18T10:30:01.000Z","cwd":"/Users/me/proj","originator":"codex_cli_rs","cli_version":"0.29.0"}}';
const USER_MSG =
  '{"timestamp":"2026-07-18T10:30:05.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"fix the flaky parser test"}]}}';

describe("parseRolloutFilename", () => {
  it("extracts the embedded local timestamp and uuid", () => {
    const r = parseRolloutFilename(
      "rollout-2026-07-18T10-30-01-11111111-2222-3333-4444-555555555555.jsonl",
    );
    expect(r?.id).toBe("11111111-2222-3333-4444-555555555555");
    // local-time construction — compare against the same construction, not a fixed epoch
    expect(r?.timestampMs).toBe(new Date(2026, 6, 18, 10, 30, 1).getTime());
  });
  it("rejects anything else", () => {
    expect(parseRolloutFilename("rollout-garbage.jsonl")).toBeNull();
    expect(parseRolloutFilename("11111111.jsonl")).toBeNull();
  });
});

describe("parseRolloutHead", () => {
  it("reads id/cwd/timestamp from the session_meta line and the title from the first user text", () => {
    const head = parseRolloutHead([META, USER_MSG].join("\n"));
    expect(head.id).toBe("11111111-2222-3333-4444-555555555555");
    expect(head.cwd).toBe("/Users/me/proj");
    expect(head.timestampMs).toBe(Date.parse("2026-07-18T10:30:01.000Z"));
    expect(head.title).toBe("fix the flaky parser test");
  });
  it("tolerates a bare legacy meta object and missing title", () => {
    const head = parseRolloutHead(
      '{"id":"aaa","timestamp":"2026-07-18T09:00:00Z","cwd":"/w"}',
    );
    expect(head.id).toBe("aaa");
    expect(head.cwd).toBe("/w");
    expect(head.title).toBeNull();
  });
  it("skips machine-context user texts (leading <) and malformed lines", () => {
    const ctx =
      '{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>…</environment_context>"}]}}';
    const head = parseRolloutHead([META, "not json", ctx, USER_MSG].join("\n"));
    expect(head.title).toBe("fix the flaky parser test");
  });
  it("skips injected AGENTS.md instructions before the real user prompt", () => {
    const agents = JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "# AGENTS.md instructions for /workspace\n\n<INSTRUCTIONS>\nUse pnpm\n</INSTRUCTIONS>",
          },
        ],
      },
    });
    const head = parseRolloutHead([META, agents, USER_MSG].join("\n"));
    expect(head.title).toBe("fix the flaky parser test");
  });
  it("returns an all-null head for unusable text instead of throwing", () => {
    expect(parseRolloutHead("")).toEqual({
      id: null,
      cwd: "",
      timestampMs: null,
      title: null,
    });
  });
});

describe("listRollouts / readRolloutHead", () => {
  it("walks sessions/YYYY/MM/DD, skipping non-rollout files and unreadable dirs", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-"));
    const day = join(home, "sessions", "2026", "07", "18");
    mkdirSync(day, { recursive: true });
    const name =
      "rollout-2026-07-18T10-30-01-11111111-2222-3333-4444-555555555555.jsonl";
    writeFileSync(join(day, name), [META, USER_MSG].join("\n"));
    writeFileSync(join(day, "notes.txt"), "ignore me");
    const files = listRollouts(home);
    expect(files).toHaveLength(1);
    expect(files[0].id).toBe("11111111-2222-3333-4444-555555555555");
    expect(files[0].mtimeMs).toBeGreaterThan(0);
    expect(readRolloutHead(files[0].path)?.cwd).toBe("/Users/me/proj");
  });
  it("treats a missing sessions dir as empty", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-empty-"));
    expect(listRollouts(home)).toEqual([]);
  });
});

describe("resolveCodexDir", () => {
  it("override beats CODEX_HOME beats ~/.codex", () => {
    expect(resolveCodexDir("/x")).toBe("/x");
    expect(resolveCodexDir()).toContain(".codex"); // no env set in tests
  });
});
