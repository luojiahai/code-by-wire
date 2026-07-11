import { describe, it, expect, vi } from "vitest";
import type { PersistedSession, SessionCandidate } from "@shared/types";
import type { Provider } from "../../src/main/provider/types";
import { syncSessions } from "../../src/main/sync";
import { migrate, getPersisted, getSessions } from "../../src/main/db/store";
import { openTestDb } from "../helpers/sqlite";

const cand = (
  id: string,
  over: Partial<SessionCandidate> = {},
): SessionCandidate => ({
  id,
  alive: true,
  status: "idle",
  cwd: `/w/${id}`,
  transcriptPath: `/w/${id}/${id}.jsonl`,
  transcriptMtimeMs: 100,
  ...over,
});

const snapOf = (c: SessionCandidate): PersistedSession => ({
  id: c.id,
  title: c.id,
  project: c.id,
  cwd: c.cwd,
  branch: undefined,
  state: c.alive ? "idle" : "ended",
  management: "observed",
  model: "opus",
  lastActivityMs: c.transcriptMtimeMs,
  createdMs: 0,
  awaitingUser: false,
  transcriptMtimeMs: c.transcriptMtimeMs,
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  },
  contextTokens: 0,
});

// A fake provider with spied primitives, so we can assert exactly which candidates were summarized
// (parsed) vs restated (reused). restate mirrors the real one: state-only refresh from liveness.
function fakeProvider(candidates: SessionCandidate[]): {
  provider: Provider;
  summarize: ReturnType<typeof vi.fn>;
  restate: ReturnType<typeof vi.fn>;
} {
  const summarize = vi.fn((c: SessionCandidate) => snapOf(c));
  const restate = vi.fn((c: SessionCandidate, prev: PersistedSession) => ({
    ...prev,
    state: c.alive ? prev.state : ("ended" as const),
  }));
  return {
    provider: {
      id: "fake",
      capabilities: {
        canControl: false,
        hasRateLimits: false,
        hasSubagents: false,
      },
      listCandidates: () => candidates,
      summarize,
      restate,
      readTranscript: () => ({ status: "absent" }),
      readSubagentTranscript: () => ({ status: "absent" }),
      readTasks: () => ({ status: "absent" }),
      readShells: () => ({ status: "absent" }),
      readShellOutput: () => ({ status: "absent" }),
      readMonitors: () => ({ status: "absent" }),
      readMonitorOutput: () => ({ status: "absent" }),
      readMetrics: () => ({ status: "absent" }),
      resolveAdoptTarget: () => null,
      resolveSessionCwd: () => null,
      getToolResult: () => ({ found: false }),
    },
    summarize,
    restate,
  };
}

describe("syncSessions", () => {
  it("parses every transcript-bearing candidate on the first pass and persists them", () => {
    const db = openTestDb();
    migrate(db);
    const { provider, summarize } = fakeProvider([cand("a"), cand("b")]);
    const r = syncSessions(db, provider);
    expect(r.parsedIds.sort()).toEqual(["a", "b"]);
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(
      getSessions(db)
        .map((s) => s.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("reparses nothing and leaves the rows identical on an unchanged second pass", () => {
    const db = openTestDb();
    migrate(db);
    const { provider, summarize, restate } = fakeProvider([
      cand("a"),
      cand("b"),
    ]);
    syncSessions(db, provider);
    const before = getPersisted(db);
    summarize.mockClear();
    const r = syncSessions(db, provider);
    expect(r.parsedIds).toEqual([]);
    expect(summarize).not.toHaveBeenCalled();
    expect(restate).toHaveBeenCalledTimes(2); // reused, not reparsed
    expect(getPersisted(db)).toEqual(before);
  });

  it("reparses only the candidate whose transcript mtime advanced", () => {
    const db = openTestDb();
    migrate(db);
    syncSessions(db, fakeProvider([cand("a"), cand("b")]).provider);
    const second = fakeProvider([
      cand("a"),
      cand("b", { transcriptMtimeMs: 200 }),
    ]);
    const r = syncSessions(db, second.provider);
    expect(r.parsedIds).toEqual(["b"]);
    expect(second.summarize).toHaveBeenCalledTimes(1);
    expect(second.summarize.mock.calls[0][0].id).toBe("b");
  });

  it("flips a vanished process to ended without reparsing, then prunes when it drops out", () => {
    const db = openTestDb();
    migrate(db);
    syncSessions(db, fakeProvider([cand("a")]).provider);
    expect(getSessions(db)[0].state).toBe("idle");

    // Same transcript (unchanged mtime), process gone → restated to ended, no parse.
    const r = syncSessions(
      db,
      fakeProvider([cand("a", { alive: false })]).provider,
    );
    expect(r.parsedIds).toEqual([]);
    expect(getSessions(db)[0].state).toBe("ended");

    // A later pass no longer lists it → pruned out of the index.
    const r2 = syncSessions(db, fakeProvider([]).provider);
    expect(r2.prunedIds).toEqual(["a"]);
    expect(getSessions(db)).toEqual([]);
  });

  it("persists a registry-only (no transcript) candidate without counting it as parsed", () => {
    const db = openTestDb();
    migrate(db);
    const { provider } = fakeProvider([
      cand("skel", { transcriptPath: undefined, transcriptMtimeMs: 0 }),
    ]);
    const r = syncSessions(db, provider);
    expect(r.parsedIds).toEqual([]); // no transcript → not a parse
    expect(getSessions(db).map((s) => s.id)).toEqual(["skel"]);
  });

  it("rolls back the upsert when pruning fails mid-pass, leaving the prior index intact", () => {
    const db = openTestDb();
    migrate(db);
    syncSessions(db, fakeProvider([cand("a")]).provider);
    const before = getPersisted(db);

    // After the upsert has run, make the prune statement throw. Upsert and prune share one
    // transaction now, so the advanced 'a' and the new 'z' must roll back with the failed prune.
    const realPrepare = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      if (/DELETE FROM sessions WHERE/i.test(sql))
        throw new Error("prune boom");
      return realPrepare(sql);
    };
    expect(() =>
      syncSessions(
        db,
        fakeProvider([cand("a", { transcriptMtimeMs: 200 }), cand("z")])
          .provider,
      ),
    ).toThrow("prune boom");
    db.prepare = realPrepare;

    expect(getPersisted(db)).toEqual(before);
  });
});
