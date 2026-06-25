import { describe, it, expect } from "vitest";
import type { Session } from "../../src/shared/types";
import { mergeManaged } from "../../src/shared/managed";

const s = (
  id: string,
  management: Session["management"] = "observed",
): Session => ({
  id,
  title: id,
  project: "p",
  state: "working",
  management,
  resumable: true,
  model: "sonnet",
  contextPct: 0,
  contextWindow: 200_000,
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  },
  equivApiValueUsd: 0,
  lastActivityMs: 0,
  createdMs: 0,
});

describe("mergeManaged", () => {
  it("appends a draft that discovery has not indexed yet", () => {
    const merged = mergeManaged([s("a")], [s("draft", "managed")]);
    expect(merged.map((x) => x.id)).toEqual(["a", "draft"]);
  });

  it("lets the real discovered row win over a draft of the same id", () => {
    const real = s("dup", "managed");
    real.title = "real title";
    const draft = s("dup", "managed");
    draft.title = "draft title";
    const merged = mergeManaged([real], [draft]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("real title");
  });

  it("keeps discovered sessions first, drafts after", () => {
    const merged = mergeManaged(
      [s("a"), s("b")],
      [s("d1", "managed"), s("d2", "managed")],
    );
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "d1", "d2"]);
  });

  it("is a no-op when there are no drafts", () => {
    const sessions = [s("a"), s("b")];
    expect(mergeManaged(sessions, [])).toEqual(sessions);
  });
});
