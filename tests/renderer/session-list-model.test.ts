import { describe, expect, it } from "vitest";
import {
  sortSessions,
  filterSessions,
  filterActive,
  groupSessionsByProject,
} from "../../src/renderer/src/shell/session-list-model";
import type { Session } from "@shared/types";

const mk = (o: Partial<Session>): Session => ({
  id: "s",
  title: "Session",
  project: "proj",
  state: "idle",
  management: "managed",
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
  lastActivityMs: 0,
  createdMs: 0,
  ...o,
});

describe("session list model", () => {
  it("active (createdMs desc) before ended (lastActivityMs desc)", () => {
    const a = mk({
      id: "a",
      state: "working",
      createdMs: 100,
      lastActivityMs: 100,
    });
    const b = mk({
      id: "b",
      state: "idle",
      createdMs: 200,
      lastActivityMs: 150,
    });
    const e = mk({
      id: "e",
      state: "ended",
      createdMs: 50,
      lastActivityMs: 300,
    });
    expect(sortSessions([a, b, e]).map((s) => s.id)).toEqual(["b", "a", "e"]);
  });
  it("filters by title/project, case-insensitive", () => {
    const a = mk({ id: "a", title: "Auth", project: "web" });
    const b = mk({ id: "b", title: "DB", project: "api" });
    expect(filterSessions([a, b], "AUT").map((s) => s.id)).toEqual(["a"]);
  });
  it("filterActive drops only ended, preserving order", () => {
    const w = mk({ id: "w", state: "working" });
    const e = mk({ id: "e", state: "ended" });
    const i = mk({ id: "i", state: "idle" });
    const wa = mk({ id: "wa", state: "waiting" });
    expect(filterActive([w, e, i, wa]).map((s) => s.id)).toEqual([
      "w",
      "i",
      "wa",
    ]);
  });

  it("a project with only ended sessions yields no group once filtered", () => {
    const a = mk({ id: "a", state: "working", project: "alpha" });
    const e1 = mk({ id: "e1", state: "ended", project: "beta" });
    expect(
      groupSessionsByProject(filterActive([a, e1])).map((g) => g.project),
    ).toEqual(["alpha"]);
  });
});
