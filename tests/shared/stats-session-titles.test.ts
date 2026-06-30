import { describe, it, expect } from "vitest";
import { withSessionTitles, type StatsBySession } from "@shared/stats";

const row = (over: Partial<StatsBySession> = {}): StatsBySession => ({
  sessionId: "s",
  cwd: "/w/proj",
  project: "proj",
  modelRaw: "claude-opus-4-8",
  lastActivityMs: 0,
  durationMs: 0,
  turns: 0,
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  title: null,
  ...over,
});

describe("withSessionTitles", () => {
  it("takes the index title when there's no override", () => {
    const out = withSessionTitles(
      [row({ sessionId: "a" })],
      { a: "Indexed" },
      {},
    );
    expect(out[0].title).toBe("Indexed");
  });

  it("lets a user rename win over the index title", () => {
    const out = withSessionTitles(
      [row({ sessionId: "a" })],
      { a: "Indexed" },
      { a: "Renamed" },
    );
    expect(out[0].title).toBe("Renamed");
  });

  it("leaves title null when neither source knows the session", () => {
    const out = withSessionTitles([row({ sessionId: "ghost" })], {}, {});
    expect(out[0].title).toBeNull();
  });

  it("returns the same row reference when the title is unchanged (cheap no-op)", () => {
    const r = row({ sessionId: "a", title: "Same" });
    const out = withSessionTitles([r], { a: "Same" }, {});
    expect(out[0]).toBe(r);
  });

  it("takes Claude's live session_name over the index title", () => {
    const out = withSessionTitles(
      [row({ sessionId: "a" })],
      { a: "Indexed" },
      {},
      { a: "LiveName" },
    );
    expect(out[0].title).toBe("LiveName");
  });

  it("lets a user rename win over the live session_name", () => {
    const out = withSessionTitles(
      [row({ sessionId: "a" })],
      { a: "Indexed" },
      { a: "Renamed" },
      { a: "LiveName" },
    );
    expect(out[0].title).toBe("Renamed");
  });

  it("falls through an empty-string override to the next source instead of blanking", () => {
    const out = withSessionTitles(
      [row({ sessionId: "a" })],
      { a: "Indexed" },
      { a: "" },
    );
    expect(out[0].title).toBe("Indexed");
  });

  it("falls through an empty-string index title to null", () => {
    const out = withSessionTitles([row({ sessionId: "a" })], { a: "" }, {});
    expect(out[0].title).toBeNull();
  });
});
