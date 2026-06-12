import { describe, it, expect } from "vitest";
import type { Session } from "../../src/shared/types";
import { groupSessions } from "../../src/shared/overview";

function s(
  id: string,
  state: Session["state"],
  over: Partial<Session> = {},
): Session {
  return {
    id,
    title: `Session ${id}`,
    project: "code-by-wire",
    state,
    management: "managed",
    model: "claude-sonnet-4-6",
    contextPct: 10,
    contextWindow: 200000,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
    equivApiValueUsd: 0,
    lastActivityMs: 0,
    ...over,
  };
}

describe("groupSessions", () => {
  it("groups by state in display order (waiting → working → idle → ended) and drops empty groups", () => {
    const groups = groupSessions(
      [s("a", "idle"), s("b", "waiting"), s("c", "idle")],
      "",
    );
    expect(groups.map((g) => g.state)).toEqual(["waiting", "idle"]);
    expect(groups[1].items.map((i) => i.id)).toContain("a");
  });

  it("orders each group most-recent first", () => {
    const groups = groupSessions(
      [
        s("old", "working", { lastActivityMs: 100 }),
        s("new", "working", { lastActivityMs: 200 }),
      ],
      "",
    );
    expect(groups[0].items.map((i) => i.id)).toEqual(["new", "old"]);
  });

  it("filters by a case-insensitive substring over title and project", () => {
    const groups = groupSessions(
      [
        s("a", "idle", { title: "Wire the reader" }),
        s("b", "idle", { title: "Other", project: "flight-deck" }),
      ],
      "flight",
    );
    expect(groups.flatMap((g) => g.items).map((i) => i.id)).toEqual(["b"]);
  });

  it("returns no groups when nothing matches", () => {
    expect(groupSessions([s("a", "idle")], "zzz")).toEqual([]);
  });
});
