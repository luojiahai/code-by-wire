import { describe, it, expect } from "vitest";
import type { StatsBySession } from "@shared/stats";
import {
  sortSessions,
  defaultDirFor,
  DEFAULT_SESSION_SORT,
} from "../../src/renderer/src/stats/session-sort";

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
  equivApiValueUsd: 0,
  ...over,
});

describe("sortSessions", () => {
  it("defaults to most recent activity first", () => {
    expect(DEFAULT_SESSION_SORT).toEqual({ key: "lastActivity", dir: "desc" });
    const rows = [
      row({ sessionId: "old", lastActivityMs: 1000 }),
      row({ sessionId: "new", lastActivityMs: 9000 }),
    ];
    expect(
      sortSessions(rows, DEFAULT_SESSION_SORT, true).map((r) => r.sessionId),
    ).toEqual(["new", "old"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      row({ sessionId: "a", lastActivityMs: 1 }),
      row({ sessionId: "b", lastActivityMs: 2 }),
    ];
    const before = rows.map((r) => r.sessionId);
    sortSessions(rows, { key: "lastActivity", dir: "asc" }, true);
    expect(rows.map((r) => r.sessionId)).toEqual(before);
  });

  it("sorts ascending and descending by a numeric column", () => {
    const rows = [
      row({ sessionId: "a", durationMs: 100 }),
      row({ sessionId: "b", durationMs: 300 }),
      row({ sessionId: "c", durationMs: 200 }),
    ];
    expect(
      sortSessions(rows, { key: "duration", dir: "desc" }, true).map(
        (r) => r.sessionId,
      ),
    ).toEqual(["b", "c", "a"]);
    expect(
      sortSessions(rows, { key: "duration", dir: "asc" }, true).map(
        (r) => r.sessionId,
      ),
    ).toEqual(["a", "c", "b"]);
  });

  it("sorts the tokens column by the cache toggle, matching the visible figure", () => {
    // 'fresh' has more fresh tokens; 'cachey' has more total once cache is counted.
    const rows = [
      row({
        sessionId: "fresh",
        inputTokens: 500,
        outputTokens: 0,
        totalTokens: 500,
      }),
      row({
        sessionId: "cachey",
        inputTokens: 100,
        outputTokens: 0,
        totalTokens: 9000,
      }),
    ];
    // Include cache → cachey (9000) tops.
    expect(
      sortSessions(rows, { key: "tokens", dir: "desc" }, true).map(
        (r) => r.sessionId,
      ),
    ).toEqual(["cachey", "fresh"]);
    // Exclude cache → fresh (500) tops over cachey (100).
    expect(
      sortSessions(rows, { key: "tokens", dir: "desc" }, false).map(
        (r) => r.sessionId,
      ),
    ).toEqual(["fresh", "cachey"]);
  });

  it("sorts n/a cost below every real cost in descending order", () => {
    const rows = [
      row({ sessionId: "na", equivApiValueUsd: null }),
      row({ sessionId: "cheap", equivApiValueUsd: 0.5 }),
      row({ sessionId: "dear", equivApiValueUsd: 9 }),
    ];
    expect(
      sortSessions(rows, { key: "cost", dir: "desc" }, true).map(
        (r) => r.sessionId,
      ),
    ).toEqual(["dear", "cheap", "na"]);
  });

  it("breaks ties by session id, stable across a direction flip", () => {
    const rows = [
      row({ sessionId: "b", lastActivityMs: 5000 }),
      row({ sessionId: "a", lastActivityMs: 5000 }),
    ];
    // Equal keys → session id ascending in both directions (a before b).
    expect(
      sortSessions(rows, { key: "lastActivity", dir: "desc" }, true).map(
        (r) => r.sessionId,
      ),
    ).toEqual(["a", "b"]);
    expect(
      sortSessions(rows, { key: "lastActivity", dir: "asc" }, true).map(
        (r) => r.sessionId,
      ),
    ).toEqual(["a", "b"]);
  });

  it("sorts by the model column", () => {
    const rows = [
      row({ sessionId: "1", modelRaw: "claude-sonnet-4-6" }),
      row({ sessionId: "2", modelRaw: "claude-opus-4-8" }),
    ];
    expect(
      sortSessions(rows, { key: "model", dir: "asc" }, true).map(
        (r) => r.modelRaw,
      ),
    ).toEqual(["claude-opus-4-8", "claude-sonnet-4-6"]);
  });

  it("sorts by the turns column", () => {
    const rows = [
      row({ sessionId: "a", turns: 3 }),
      row({ sessionId: "b", turns: 30 }),
      row({ sessionId: "c", turns: 12 }),
    ];
    expect(
      sortSessions(rows, { key: "turns", dir: "desc" }, true).map(
        (r) => r.sessionId,
      ),
    ).toEqual(["b", "c", "a"]);
  });

  it("sorts text columns by locale order (lowercase before uppercase)", () => {
    const rows = [
      row({ sessionId: "1", project: "Zebra" }),
      row({ sessionId: "2", project: "apple" }),
    ];
    expect(
      sortSessions(rows, { key: "project", dir: "asc" }, true).map(
        (r) => r.project,
      ),
    ).toEqual(["apple", "Zebra"]);
  });
});

describe("defaultDirFor", () => {
  it("starts text columns ascending and numeric/time columns descending", () => {
    expect(defaultDirFor("project")).toBe("asc");
    expect(defaultDirFor("model")).toBe("asc");
    expect(defaultDirFor("lastActivity")).toBe("desc");
    expect(defaultDirFor("duration")).toBe("desc");
    expect(defaultDirFor("turns")).toBe("desc");
    expect(defaultDirFor("tokens")).toBe("desc");
    expect(defaultDirFor("cost")).toBe("desc");
  });
});
