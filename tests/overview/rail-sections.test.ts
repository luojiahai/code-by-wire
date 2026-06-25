import { describe, it, expect } from "vitest";
import type { Session } from "../../src/shared/types";
import { railSections, orderedSessions } from "../../src/shared/overview";

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
    resumable: true,
    model: "sonnet",
    contextPct: 10,
    contextWindow: 200000,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      cacheCreation5mTokens: 0,
      cacheCreation1hTokens: 0,
    },
    equivApiValueUsd: 0,
    createdMs: 0,
    lastActivityMs: 0,
    ...over,
  };
}

describe("railSections", () => {
  it("merges waiting/working/idle into Active and keeps Ended separate", () => {
    const { active, ended } = railSections(
      [s("a", "idle"), s("b", "waiting"), s("c", "working"), s("d", "ended")],
      "",
    );
    expect(active.map((x) => x.id)).toEqual(["a", "b", "c"]); // all createdMs 0 → id tiebreak
    expect(ended.map((x) => x.id)).toEqual(["d"]);
  });

  it("orders Active newest-created first", () => {
    const { active } = railSections(
      [
        s("old", "working", { createdMs: 100 }),
        s("new", "idle", { createdMs: 200 }),
      ],
      "",
    );
    expect(active.map((x) => x.id)).toEqual(["new", "old"]);
  });

  it("breaks createdMs ties by id for a stable order", () => {
    const { active } = railSections(
      [
        s("b", "idle", { createdMs: 100 }),
        s("a", "working", { createdMs: 100 }),
      ],
      "",
    );
    expect(active.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("orders Ended most-recently-active first", () => {
    const { ended } = railSections(
      [
        s("x", "ended", { lastActivityMs: 1 }),
        s("y", "ended", { lastActivityMs: 9 }),
      ],
      "",
    );
    expect(ended.map((x) => x.id)).toEqual(["y", "x"]);
  });

  it("filters both zones by a case-insensitive substring over title and project", () => {
    const { active, ended } = railSections(
      [
        s("a", "idle", { title: "keep me" }),
        s("b", "idle", { title: "nope" }),
        s("c", "ended", { title: "keep too" }),
      ],
      "keep",
    );
    expect(active.map((x) => x.id)).toEqual(["a"]);
    expect(ended.map((x) => x.id)).toEqual(["c"]);
  });

  it("leaves both zones empty when nothing matches", () => {
    const { active, ended } = railSections(
      [s("a", "idle"), s("b", "ended")],
      "zzz",
    );
    expect(active).toEqual([]);
    expect(ended).toEqual([]);
  });
});

describe("orderedSessions", () => {
  it("flattens to Active then Ended", () => {
    const ordered = orderedSessions(
      [
        s("act", "working", { createdMs: 5 }),
        s("end", "ended", { lastActivityMs: 9 }),
      ],
      "",
    );
    expect(ordered.map((x) => x.id)).toEqual(["act", "end"]);
  });
});
