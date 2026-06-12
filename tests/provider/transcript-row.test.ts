import { describe, it, expect } from "vitest";
import { parseJsonlRows } from "../../src/main/provider/claude/transcript-row";

describe("parseJsonlRows", () => {
  it("parses each non-blank line and skips unparseable ones", () => {
    const jsonl = ['{"a":1}', "", "  ", "not json", '{"b":2}'].join("\n");
    expect(parseJsonlRows(jsonl)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("returns [] for empty input", () => {
    expect(parseJsonlRows("")).toEqual([]);
  });

  it("tolerates a half-written trailing line", () => {
    const jsonl = '{"ok":true}\n{"partial":';
    expect(parseJsonlRows(jsonl)).toEqual([{ ok: true }]);
  });
});
