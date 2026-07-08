import { describe, it, expect } from "vitest";
import type { AnalyticsTurn } from "../../src/main/db/analytics";
import {
  migrateAnalytics,
  upsertTurns,
  readTotals,
  readByModel,
  readByProject,
  readByBranch,
  readBySession,
  readBreakdowns,
  readDaily,
  readRecords,
  emptyTotals,
  readProcessedFiles,
  upsertProcessedFile,
  hasAnyTurns,
  readCalendar,
  readCalendarYears,
  clearAnalytics,
  readWorktrees,
  upsertWorktree,
} from "../../src/main/db/analytics";
import { openTestDb } from "../helpers/sqlite";
import { usage as mkUsage } from "../helpers/usage";
import type { Usage } from "@shared/types";
import { ALL_TIME } from "@shared/stats";

const turn = (
  over: Partial<Omit<AnalyticsTurn, "usage">> & { usage?: Partial<Usage> } = {},
): AnalyticsTurn => {
  const { usage, ...rest } = over;
  return {
    messageId: "msg-1",
    sessionId: "sess-1",
    ts: 1000,
    modelRaw: "claude-opus-4-8",
    usage: mkUsage(usage),
    cwd: "/work/code-by-wire",
    project: "code-by-wire",
    branch: "main",
    ...rest,
  };
};

describe("analytics store", () => {
  it("migrates to schema v4 and is idempotent", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    migrateAnalytics(db); // second call is a no-op, not an error
    expect(
      (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    ).toBe(4);
  });

  it("creates processed_files and round-trips a high-water mark", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readProcessedFiles(db).size).toBe(0);

    upsertProcessedFile(db, "/a.jsonl", 111.5, 3);
    upsertProcessedFile(db, "/a.jsonl", 222.5, 9); // upsert by path, not a second row
    upsertProcessedFile(db, "/b.jsonl", 333, 1);

    const map = readProcessedFiles(db);
    expect(map.size).toBe(2);
    expect(map.get("/a.jsonl")).toEqual({ mtime: 222.5, lines: 9 });
    expect(map.get("/b.jsonl")).toEqual({ mtime: 333, lines: 1 });
  });

  it("is durable: re-running migrate preserves turns and processed_files", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [turn()]);
    upsertProcessedFile(db, "/a.jsonl", 1, 1);
    migrateAnalytics(db); // already at v3 → the guard skips the block; nothing is wiped
    expect(readTotals(db).turns).toBe(1);
    expect(readProcessedFiles(db).get("/a.jsonl")).toEqual({
      mtime: 1,
      lines: 1,
    });
  });

  it("clears turns once on the v1 → v2 upgrade (id-less surrogate scheme changed)", () => {
    // Simulate a slice-1 (v1) store: the v1 turns table with a row, user_version pinned at 1.
    const db = openTestDb();
    db.exec(`
      CREATE TABLE turns (
        message_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, ts INTEGER NOT NULL DEFAULT 0,
        model_raw TEXT, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        cwd TEXT NOT NULL DEFAULT '', project TEXT NOT NULL DEFAULT '', branch TEXT
      );
      PRAGMA user_version = 1;
    `);
    // Insert via raw SQL matching the old 11-column schema — upsertTurns now binds the new columns
    // that the manually-created old table lacks, so it would fail.
    db.exec(
      `INSERT INTO turns (message_id, session_id, ts, model_raw, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cwd, project, branch)
       VALUES ('msg-1','sess-1',1000,'claude-opus-4-8',0,0,0,0,'/work/code-by-wire','code-by-wire','main')`,
    );
    // Verify the row landed using a direct count (not readTotals — the new query references columns the
    // pre-migration table lacks).
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM turns").get() as { n: number }).n,
    ).toBe(1);

    migrateAnalytics(db); // 1 → 4: clears turns so the next scan rebuilds under the new surrogate scheme
    expect(readTotals(db).turns).toBe(0);
    expect(readProcessedFiles(db).size).toBe(0); // new table exists and is empty
    expect(
      (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    ).toBe(4);
  });

  it("only clears turns on the v1 → v2 step, never on another upgrade (no future-bump re-wipe)", () => {
    // The destructive DELETE is the v1-surrogate-scheme fix, scoped to `from === 1`. Any other upgrade
    // into v2+ must preserve history — this guards the next bump (v2 → v3) from silently wiping turns.
    // Simulate a store that enters the migration block from a version other than 1 (here 0) carrying data.
    const db = openTestDb();
    db.exec(`
      CREATE TABLE turns (
        message_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, ts INTEGER NOT NULL DEFAULT 0,
        model_raw TEXT, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        cwd TEXT NOT NULL DEFAULT '', project TEXT NOT NULL DEFAULT '', branch TEXT
      );
      PRAGMA user_version = 0;
    `);
    // Insert via raw SQL matching the old 11-column schema — upsertTurns now binds the new columns
    // that the manually-created old table lacks, so it would fail.
    db.exec(
      `INSERT INTO turns (message_id, session_id, ts, model_raw, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cwd, project, branch)
       VALUES ('msg-1','sess-1',1000,'claude-opus-4-8',0,0,0,0,'/work/code-by-wire','code-by-wire','main')`,
    );

    migrateAnalytics(db); // enters the block (0 < 4) but `from !== 1`, so turns survive
    expect(readTotals(db).turns).toBe(1);
    expect(
      (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    ).toBe(4);
  });

  it("returns zeroed totals for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readTotals(db)).toEqual(emptyTotals());
  });

  it("upserts by message_id rather than inserting duplicates (last-write-wins)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        usage: {
          inputTokens: 1,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    upsertTurns(db, [
      turn({
        usage: {
          inputTokens: 9,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const t = readTotals(db);
    expect(t.turns).toBe(1);
    expect(t.inputTokens).toBe(9); // last write wins
  });

  it("counts distinct sessions, turns, and tokens by kind", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "a",
        sessionId: "s1",
        usage: {
          inputTokens: 100,
          outputTokens: 10,
          cacheReadTokens: 5,
          cacheCreationTokens: 2,
        },
      }),
      turn({
        messageId: "b",
        sessionId: "s1",
        usage: {
          inputTokens: 200,
          outputTokens: 20,
          cacheReadTokens: 5,
          cacheCreationTokens: 3,
        },
      }),
      turn({
        messageId: "c",
        sessionId: "s2",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const t = readTotals(db);
    expect(t.sessions).toBe(2);
    expect(t.turns).toBe(3);
    expect(t.inputTokens).toBe(300);
    expect(t.outputTokens).toBe(30);
    expect(t.cacheReadTokens).toBe(10);
    expect(t.cacheCreationTokens).toBe(5);
  });

  it("scopes totals to turns at or after the since bound (inclusive at the edge)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "old",
        ts: 1000,
        usage: {
          inputTokens: 1,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "edge",
        ts: 2000,
        usage: {
          inputTokens: 10,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "new",
        ts: 3000,
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    // since == the edge turn's ts: the edge is included (>=), the older one excluded.
    const scoped = readTotals(db, { sinceMs: 2000, untilMs: null });
    expect(scoped.turns).toBe(2);
    expect(scoped.inputTokens).toBe(110);
    // one ms past the edge: the edge falls out, only the newest remains.
    expect(readTotals(db, { sinceMs: 2001, untilMs: null }).turns).toBe(1);
    expect(readTotals(db, { sinceMs: 2001, untilMs: null }).inputTokens).toBe(
      100,
    );
  });

  it("counts all-time with no bound (a null bound matches the no-arg call)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({ messageId: "a", ts: 1000 }),
      turn({ messageId: "b", ts: 9_999_999 }),
    ]);
    expect(readTotals(db).turns).toBe(2);
    expect(readTotals(db, { sinceMs: null, untilMs: null }).turns).toBe(2);
  });

  it("scopes sessions and tokens to the window", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // out of window: a different session, 1M opus input — must not leak into the scoped value.
      turn({
        messageId: "old",
        sessionId: "s-old",
        ts: 1000,
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      // in window: a sonnet turn, 1M input.
      turn({
        messageId: "new",
        sessionId: "s-new",
        ts: 5000,
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const scoped = readTotals(db, { sinceMs: 5000, untilMs: null });
    expect(scoped.sessions).toBe(1); // only s-new is active in the window
    expect(scoped.inputTokens).toBe(1_000_000);
  });

  it("reports whether the store holds any turn (range-independent)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(hasAnyTurns(db)).toBe(false);
    upsertTurns(db, [turn()]);
    expect(hasAnyTurns(db)).toBe(true);
  });

  it("keeps unknown-time (ts=0) turns in all-time but excludes them from windows", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // ts=0 is the unknown-time sentinel (an unparseable transcript timestamp).
      turn({
        messageId: "no-time",
        ts: 0,
        usage: {
          inputTokens: 7,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    // All-time keeps it; any positive window bound drops it (a turn with no known time can't be placed
    // in a calendar window). hasAnyTurns still sees it, so the view shows zeroed cards, not the empty state.
    expect(readTotals(db).turns).toBe(1);
    expect(readTotals(db).inputTokens).toBe(7);
    expect(readTotals(db, { sinceMs: 1, untilMs: null }).turns).toBe(0);
    expect(readTotals(db, { sinceMs: 1, untilMs: null }).inputTokens).toBe(0);
    expect(hasAnyTurns(db)).toBe(true);
  });

  it("counts an unrecognized model's tokens", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "known",
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "unknown",
        modelRaw: "gpt-9-ultra", // matches no family
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const t = readTotals(db);
    expect(t.turns).toBe(2);
    expect(t.inputTokens).toBe(2_000_000); // unknown model's tokens still counted
  });

  it("carries the 5m and 1h cache-write token columns", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    // opus: 1M tokens into the 5m cache and 1M into the 1h cache.
    upsertTurns(db, [
      turn({
        modelRaw: "claude-opus-4-8",
        usage: {
          cacheCreationTokens: 2_000_000,
          cacheCreation5mTokens: 1_000_000,
          cacheCreation1hTokens: 1_000_000,
        },
      }),
    ]);
    const t = readTotals(db);
    expect(t.cacheCreationTokens).toBe(2_000_000); // total column intact
  });

  it("sums the 5m/1h cache-write split into the totals", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        usage: {
          cacheCreationTokens: 30,
          cacheCreation5mTokens: 20,
          cacheCreation1hTokens: 10,
        },
      }),
    ]);
    const t = readTotals(db);
    expect(t.cacheCreation5mTokens).toBe(20);
    expect(t.cacheCreation1hTokens).toBe(10);
    expect(t.cacheCreation5mTokens + t.cacheCreation1hTokens).toBe(
      t.cacheCreationTokens,
    );
  });

  it("round-trips worktree mappings keyed by cwd (upsert wins)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readWorktrees(db)).toEqual([]);

    upsertWorktree(db, {
      cwd: "/w/repo-wt",
      repoRoot: "/w/repo",
      name: "repo-wt",
    });
    upsertWorktree(db, {
      cwd: "/w/repo-wt",
      repoRoot: "/w/repo2",
      name: "repo-wt",
    });
    expect(readWorktrees(db)).toEqual([
      { cwd: "/w/repo-wt", repoRoot: "/w/repo2", name: "repo-wt" },
    ]);
  });

  it("v3 → v4 keeps processed_files (no forced rescan)", () => {
    const db = openTestDb();
    migrateAnalytics(db); // v4 schema
    upsertProcessedFile(db, "/a.jsonl", 111, 3);
    db.exec("PRAGMA user_version = 3"); // pretend this store predates v4
    migrateAnalytics(db);
    expect(readProcessedFiles(db).size).toBe(1);
    expect(
      (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    ).toBe(4);
  });

  it("v2 → v4 still clears processed_files to backfill the cache split", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertProcessedFile(db, "/a.jsonl", 111, 3);
    db.exec("PRAGMA user_version = 2");
    migrateAnalytics(db);
    expect(readProcessedFiles(db).size).toBe(0);
  });
});

describe("readByModel", () => {
  it("returns one row per raw model id, tokens summed, ordered by tokens desc", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // opus: two turns, same model id → one row. 100 + 200 input + 10 cache-read = 310 tokens.
      turn({
        messageId: "o1",
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 5,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "o2",
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 200,
          outputTokens: 0,
          cacheReadTokens: 5,
          cacheCreationTokens: 0,
        },
      }),
      // sonnet: one turn, 1000 input + 1 cache-write = 1001 tokens → the bigger row, sorts first.
      turn({
        messageId: "s1",
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 1,
        },
      }),
    ]);
    const rows = readByModel(db);
    expect(rows.map((r) => r.modelRaw)).toEqual([
      "claude-sonnet-4-6",
      "claude-opus-4-8",
    ]);
    expect(rows.map((r) => r.totalTokens)).toEqual([1001, 310]);
    // input/output ride along apart from totalTokens — the donut sizes on them, so cache tokens are
    // excluded: opus is 300 (100+200), not 310; sonnet is 1000, not 1001.
    const opus = rows.find((r) => r.modelRaw === "claude-opus-4-8")!;
    expect([opus.inputTokens, opus.outputTokens]).toEqual([300, 0]);
    const sonnet = rows.find((r) => r.modelRaw === "claude-sonnet-4-6")!;
    expect([sonnet.inputTokens, sonnet.outputTokens]).toEqual([1000, 0]);
  });

  it("breaks total-token ties by raw id so order is stable, not SQLite's GROUP BY order", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "z",
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "a",
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    // Same totalTokens (100 each): the tiebreak sorts by raw id ascending, deterministically.
    expect(readByModel(db).map((r) => r.modelRaw)).toEqual([
      "claude-opus-4-8",
      "claude-sonnet-4-6",
    ]);
  });

  it("buckets a turn that recorded no model under modelRaw null", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "nomodel",
        modelRaw: undefined,
        usage: {
          inputTokens: 50,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readByModel(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].modelRaw).toBeNull();
    expect(rows[0].totalTokens).toBe(50);
  });

  it("respects the range bound, excluding out-of-window turns", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "old",
        ts: 1000,
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 999,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "new",
        ts: 5000,
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readByModel(db, { sinceMs: 5000, untilMs: null }); // since == the new turn's ts: only it survives
    expect(rows).toHaveLength(1);
    expect(rows[0].modelRaw).toBe("claude-sonnet-4-6");
    expect(rows[0].totalTokens).toBe(100);
  });

  it("returns an empty array for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readByModel(db)).toEqual([]);
  });
});

describe("readByProject", () => {
  it("separates two projects that share a basename, keyed on the full cwd (#112)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // two repos both named "app" under different parents — must NOT merge into one row.
      turn({
        messageId: "a",
        cwd: "/home/me/work/app",
        project: "app",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "b",
        cwd: "/home/me/play/app",
        project: "app",
        usage: {
          inputTokens: 200,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readByProject(db);
    expect(rows).toHaveLength(2); // two rows, not one merged "app"
    expect(rows.map((r) => r.cwd).sort()).toEqual([
      "/home/me/play/app",
      "/home/me/work/app",
    ]);
    expect(rows.every((r) => r.project === "app")).toBe(true); // both display the basename
  });

  it("sums tokens across a project's models and folds cost per model, reconciling with the totals", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // one project, two models: opus 1M input ($5) + sonnet 1M input ($3) = $8, 2M tokens.
      turn({
        messageId: "o",
        cwd: "/w/proj",
        project: "proj",
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "s",
        cwd: "/w/proj",
        project: "proj",
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readByProject(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].project).toBe("proj");
    expect(rows[0].totalTokens).toBe(2_000_000);
  });

  it("still counts tokens for a project with only unrecognized models", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "x",
        cwd: "/w/proj",
        project: "proj",
        modelRaw: "gpt-9-ultra", // matches no family
        usage: {
          inputTokens: 500,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readByProject(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalTokens).toBe(500); // tokens still counted
  });

  it("on a mixed project counts tokens across recognized and unrecognized models", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // one project, one recognized + one unrecognized model: tokens sum across both models.
      turn({
        messageId: "known",
        cwd: "/w/proj",
        project: "proj",
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "unknown",
        cwd: "/w/proj",
        project: "proj",
        modelRaw: "gpt-9-ultra", // matches no family → tokens count, cost excluded
        usage: {
          inputTokens: 2_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readByProject(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalTokens).toBe(3_000_000); // both models' tokens
  });

  it("respects the range bound, excluding out-of-window turns", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "old",
        ts: 1000,
        cwd: "/w/proj",
        project: "proj",
        usage: {
          inputTokens: 999,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "new",
        ts: 5000,
        cwd: "/w/proj",
        project: "proj",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readByProject(db, { sinceMs: 5000, untilMs: null }); // since == the new turn's ts: only it survives
    expect(rows).toHaveLength(1);
    expect(rows[0].totalTokens).toBe(100);
  });

  it("orders by total tokens descending, breaking ties by cwd", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "big",
        cwd: "/w/big",
        project: "big",
        usage: {
          inputTokens: 1000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      // a tie at 100 tokens between "/w/b" and "/w/a": cwd ascending breaks it deterministically.
      turn({
        messageId: "tb",
        cwd: "/w/b",
        project: "b",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "ta",
        cwd: "/w/a",
        project: "a",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    expect(readByProject(db).map((r) => r.cwd)).toEqual([
      "/w/big",
      "/w/a",
      "/w/b",
    ]);
  });

  it("returns an empty array for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readByProject(db)).toEqual([]);
  });

  it("sums input and output tokens per project apart from the total (fresh-vs-total split)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // One project, two turns carrying cache tokens. Fresh (input + output) is deliberately far below the
      // total so the split is pinned, not coincidentally equal.
      turn({
        messageId: "p1",
        cwd: "/w/proj",
        project: "proj",
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 1000,
          cacheCreationTokens: 5,
        },
      }),
      turn({
        messageId: "p2",
        cwd: "/w/proj",
        project: "proj",
        usage: {
          inputTokens: 200,
          outputTokens: 30,
          cacheReadTokens: 2000,
          cacheCreationTokens: 10,
        },
      }),
    ]);
    const rows = readByProject(db);
    expect(rows).toHaveLength(1);
    // total sums all four kinds: (100+20+1000+5) + (200+30+2000+10) = 3365.
    expect(rows[0].totalTokens).toBe(3365);
    // input/output ride along apart from the total so the renderer can show fresh (input+output) when the
    // cache toggle is off: 300 input + 50 output = 350 fresh, far below the 3365 total.
    expect(rows[0].inputTokens).toBe(300);
    expect(rows[0].outputTokens).toBe(50);
  });
});

describe("readByBranch", () => {
  it("groups by project and branch: one project, two branches → two rows (#112)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "m",
        cwd: "/w/proj",
        project: "proj",
        branch: "main",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "f",
        cwd: "/w/proj",
        project: "proj",
        branch: "feature",
        usage: {
          inputTokens: 50,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readByBranch(db);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.branch)).toEqual(["main", "feature"]); // main (100) before feature (50)
    expect(rows.every((r) => r.project === "proj")).toBe(true);
  });

  it("keeps the same branch name in two different projects distinct", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "a",
        cwd: "/w/a",
        project: "a",
        branch: "main",
        usage: {
          inputTokens: 10,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "b",
        cwd: "/w/b",
        project: "b",
        branch: "main",
        usage: {
          inputTokens: 10,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readByBranch(db);
    expect(rows).toHaveLength(2); // "main" in two projects is two rows, not one
    expect(rows.map((r) => r.cwd).sort()).toEqual(["/w/a", "/w/b"]);
  });

  it("buckets a turn that recorded no branch under branch null", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "n",
        cwd: "/w/proj",
        project: "proj",
        branch: undefined,
        usage: {
          inputTokens: 7,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readByBranch(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].branch).toBeNull();
    expect(rows[0].totalTokens).toBe(7);
  });

  it("respects the range bound, excluding out-of-window turns", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "old",
        ts: 1000,
        cwd: "/w/proj",
        project: "proj",
        branch: "main",
        usage: {
          inputTokens: 999,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "new",
        ts: 5000,
        cwd: "/w/proj",
        project: "proj",
        branch: "feature",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readByBranch(db, { sinceMs: 5000, untilMs: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].branch).toBe("feature");
    expect(rows[0].totalTokens).toBe(100);
  });

  it("returns an empty array for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readByBranch(db)).toEqual([]);
  });

  it("sums input and output tokens per branch apart from the total (fresh-vs-total split)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // One (project, branch) pair, two turns with cache tokens — same pinned split as the project test.
      turn({
        messageId: "b1",
        cwd: "/w/proj",
        project: "proj",
        branch: "main",
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 1000,
          cacheCreationTokens: 5,
        },
      }),
      turn({
        messageId: "b2",
        cwd: "/w/proj",
        project: "proj",
        branch: "main",
        usage: {
          inputTokens: 200,
          outputTokens: 30,
          cacheReadTokens: 2000,
          cacheCreationTokens: 10,
        },
      }),
    ]);
    const rows = readByBranch(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalTokens).toBe(3365);
    expect(rows[0].inputTokens).toBe(300);
    expect(rows[0].outputTokens).toBe(50);
  });
});

describe("readBySession", () => {
  it("aggregates one row per session: turns, tokens, last activity, and the earliest-to-latest span", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "t1",
        sessionId: "s1",
        ts: 1000,
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "t2",
        sessionId: "s1",
        ts: 5000,
        usage: {
          inputTokens: 50,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readBySession(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe("s1");
    expect(rows[0].turns).toBe(2);
    expect(rows[0].totalTokens).toBe(150);
    expect(rows[0].lastActivityMs).toBe(5000);
    expect(rows[0].durationMs).toBe(4000); // 5000 - 1000
    expect(rows[0].project).toBe("code-by-wire");
  });

  it("gives a single-turn session a zero duration (earliest equals latest)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [turn({ messageId: "only", sessionId: "s1", ts: 4242 })]);
    const rows = readBySession(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].durationMs).toBe(0);
    expect(rows[0].lastActivityMs).toBe(4242);
  });

  it("excludes unknown-time (ts=0) turns from the earliest bound, so they don't stretch the span", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({ messageId: "unknown", sessionId: "s1", ts: 0 }),
      turn({ messageId: "known", sessionId: "s1", ts: 5000 }),
    ]);
    const rows = readBySession(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].turns).toBe(2); // the ts=0 turn still counts as a turn
    expect(rows[0].lastActivityMs).toBe(5000);
    expect(rows[0].durationMs).toBe(0); // earliest known == latest == 5000, not 5000 - 0
  });

  it("gives a session whose every turn is unknown-time a zero span and epoch last activity", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({ messageId: "u1", sessionId: "s1", ts: 0 }),
      turn({ messageId: "u2", sessionId: "s1", ts: 0 }),
    ]);
    const rows = readBySession(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].turns).toBe(2); // both unknown-time turns still count
    expect(rows[0].lastActivityMs).toBe(0); // no known time → epoch, sorts last (exact data only)
    expect(rows[0].durationMs).toBe(0); // no known-time turn → no span
  });

  it("shows the dominant model by tokens but sums cost across all the session's models", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // sonnet does the most token work in this session → it's the displayed model...
      turn({
        messageId: "s",
        sessionId: "s1",
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 2_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      // ...even though opus also ran. Cost is $6 sonnet (2M input) + $5 opus (1M input) = $11.
      turn({
        messageId: "o",
        sessionId: "s1",
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readBySession(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].modelRaw).toBe("claude-sonnet-4-6"); // dominant by tokens
    expect(rows[0].totalTokens).toBe(3_000_000);
  });

  it("still counts tokens for a session with only an unrecognized model", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "x",
        sessionId: "s1",
        modelRaw: "gpt-9-ultra", // unrecognized
        usage: {
          inputTokens: 1234,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const rows = readBySession(db);
    expect(rows[0].totalTokens).toBe(1234);
  });

  it("orders rows by last activity descending, breaking ties by session id", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({ messageId: "a", sessionId: "old", ts: 1000 }),
      turn({ messageId: "b", sessionId: "new", ts: 9000 }),
      turn({ messageId: "c", sessionId: "mid", ts: 5000 }),
    ]);
    expect(readBySession(db).map((r) => r.sessionId)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("respects the range bound, excluding out-of-window sessions", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({ messageId: "old", sessionId: "old", ts: 1000 }),
      turn({ messageId: "new", sessionId: "new", ts: 5000 }),
    ]);
    const rows = readBySession(db, { sinceMs: 5000, untilMs: null }); // since == the new turn's ts: only it survives
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe("new");
  });

  it("returns an empty array for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readBySession(db)).toEqual([]);
  });
});

describe("readBreakdowns", () => {
  // The refactor's load-bearing invariant (#112): folding ONE finest-grain scan three ways must produce
  // exactly what three independent reads do. A seed that spans every axis the folds differ on — two repos
  // sharing a basename, two branches per repo, a recognized + an unrecognized model, and a null branch — so
  // any divergence between a fold and its standalone reader surfaces here.
  const seed = (): AnalyticsTurn[] => [
    turn({
      messageId: "a1",
      cwd: "/work/app",
      project: "app",
      branch: "main",
      modelRaw: "claude-opus-4-8",
      usage: {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    }),
    turn({
      messageId: "a2",
      cwd: "/work/app",
      project: "app",
      branch: "feature",
      modelRaw: "gpt-9-ultra", // unrecognized: tokens count, cost n/a
      usage: {
        inputTokens: 500,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    }),
    turn({
      messageId: "b1",
      cwd: "/play/app", // same basename, different repo — must stay distinct
      project: "app",
      branch: undefined, // null branch bucket
      modelRaw: "claude-sonnet-4-6",
      usage: {
        inputTokens: 2_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    }),
  ];

  it("folds one scan into the same rows the three standalone readers return", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, seed());
    const b = readBreakdowns(db);
    expect(b.byModel).toEqual(readByModel(db));
    expect(b.byProject).toEqual(readByProject(db));
    expect(b.bySession).toEqual(readBySession(db));
  });

  it("matches the standalone readers under a range bound too", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      ...seed().map((t, i) => ({ ...t, ts: 5000 + i })), // in-window
      turn({
        messageId: "old",
        ts: 1000,
        cwd: "/work/app",
        project: "app",
        branch: "main",
        usage: {
          inputTokens: 9_999,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const b = readBreakdowns(db, { sinceMs: 5000, untilMs: null });
    expect(b.byModel).toEqual(
      readByModel(db, { sinceMs: 5000, untilMs: null }),
    );
    expect(b.byProject).toEqual(
      readByProject(db, { sinceMs: 5000, untilMs: null }),
    );
    expect(b.bySession).toEqual(
      readBySession(db, { sinceMs: 5000, untilMs: null }),
    );
  });

  it("returns three empty breakdowns for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readBreakdowns(db)).toEqual({
      byModel: [],
      byProject: [],
      bySession: [],
    });
  });
});

describe("readDaily", () => {
  // Local noon instants: the local calendar day is unambiguous in any timezone (DST never strikes at
  // noon), and SQLite's date(...,'localtime') converts back to the same local day we built from.
  const noon = (y: number, m: number, d: number): number =>
    new Date(y, m - 1, d, 12, 0, 0).getTime();

  it("buckets two same-day turns into one bucket, summing the four token kinds", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "a",
        ts: noon(2026, 6, 14),
        usage: {
          inputTokens: 100,
          outputTokens: 10,
          cacheReadTokens: 5,
          cacheCreationTokens: 2,
        },
      }),
      turn({
        messageId: "b",
        ts: noon(2026, 6, 14),
        usage: {
          inputTokens: 200,
          outputTokens: 20,
          cacheReadTokens: 5,
          cacheCreationTokens: 3,
        },
      }),
    ]);
    const days = readDaily(db);
    expect(days).toHaveLength(1);
    expect(days[0].day).toBe("2026-06-14");
    expect(days[0].inputTokens).toBe(300);
    expect(days[0].outputTokens).toBe(30);
    expect(days[0].cacheReadTokens).toBe(10);
    expect(days[0].cacheCreationTokens).toBe(5);
  });

  it("splits turns on different local days into separate buckets, ascending by day", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "later",
        ts: noon(2026, 6, 15),
        usage: {
          inputTokens: 2,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "earlier",
        ts: noon(2026, 6, 14),
        usage: {
          inputTokens: 1,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    expect(readDaily(db).map((d) => [d.day, d.inputTokens])).toEqual([
      ["2026-06-14", 1],
      ["2026-06-15", 2],
    ]);
  });

  it("carries a per-model breakdown per day, ordered by tokens descending", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // sonnet does more token work this day → it sorts first in byModel.
      turn({
        messageId: "s",
        ts: noon(2026, 6, 14),
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "o",
        ts: noon(2026, 6, 14),
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const days = readDaily(db);
    expect(days).toHaveLength(1);
    expect(days[0].byModel).toEqual([
      {
        modelRaw: "claude-sonnet-4-6",
        totalTokens: 1000,
      },
      {
        modelRaw: "claude-opus-4-8",
        totalTokens: 100,
      },
    ]);
  });

  it("excludes unknown-time (ts=0) turns even from all-time (no spurious 1970 bucket)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "no-time",
        ts: 0,
        usage: {
          inputTokens: 7,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "dated",
        ts: noon(2026, 6, 14),
        usage: {
          inputTokens: 3,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const days = readDaily(db);
    expect(days).toHaveLength(1); // only the dated turn's day
    expect(days[0].day).toBe("2026-06-14");
    expect(days[0].inputTokens).toBe(3);
    // readTotals all-time still counts the ts=0 turn — daily is stricter (exact data only).
    expect(readTotals(db).inputTokens).toBe(10);
  });

  it("respects the range bound, excluding out-of-window days", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    const oldTs = noon(2026, 1, 1);
    const newTs = noon(2026, 6, 14);
    upsertTurns(db, [
      turn({
        messageId: "old",
        ts: oldTs,
        usage: {
          inputTokens: 999,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "new",
        ts: newTs,
        usage: {
          inputTokens: 1,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const days = readDaily(db, { sinceMs: newTs, untilMs: null }); // since == the new turn's ts: only its day survives
    expect(days).toHaveLength(1);
    expect(days[0].day).toBe("2026-06-14");
    expect(days[0].inputTokens).toBe(1);
  });

  it("returns an empty array for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readDaily(db)).toEqual([]);
  });

  it("counts tokens for an all-unrecognized day", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "u",
        ts: noon(2026, 6, 14),
        modelRaw: "gpt-9-ultra",
        usage: {
          inputTokens: 1000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const [d] = readDaily(db);
    expect(d.inputTokens).toBe(1000);
  });

  it("carries the 5m/1h token split", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        ts: Date.parse("2026-06-20T12:00:00.000Z"),
        modelRaw: "claude-opus-4-8",
        usage: {
          cacheCreationTokens: 2_000_000,
          cacheCreation5mTokens: 1_000_000,
          cacheCreation1hTokens: 1_000_000,
        },
      }),
    ]);
    const [d] = readDaily(db);
    expect(d.cacheCreation5mTokens).toBe(1_000_000);
    expect(d.cacheCreation1hTokens).toBe(1_000_000);
  });
});

// helper: a usage object with all-equal input tokens (hoisted; used by the upper-bound describe below).
function u(input: number) {
  return {
    inputTokens: input,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}

function oneIn() {
  return {
    inputTokens: 1,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}

describe("upper-bound (untilMs) scoping", () => {
  const noon = (y: number, m: number, d: number): number =>
    new Date(y, m - 1, d, 12, 0, 0).getTime();

  it("readTotals excludes turns at or after the exclusive upper bound", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    const inDay = noon(2026, 6, 14);
    const nextDay = noon(2026, 6, 15);
    upsertTurns(db, [
      turn({ messageId: "in", ts: inDay, usage: u(5) }),
      turn({ messageId: "after", ts: nextDay, usage: u(99) }),
    ]);
    // Window = just 2026-06-14: [midnight 14th, midnight 15th).
    const since = new Date(2026, 5, 14).getTime();
    const until = new Date(2026, 5, 15).getTime();
    expect(readTotals(db, { sinceMs: since, untilMs: until }).inputTokens).toBe(
      5,
    );
    expect(readTotals(db, { sinceMs: since, untilMs: until }).turns).toBe(1);
  });

  it("readBreakdowns and readDaily honor the upper bound too", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({ messageId: "in", ts: noon(2026, 6, 14), usage: u(5) }),
      turn({ messageId: "after", ts: noon(2026, 6, 15), usage: u(99) }),
    ]);
    const since = new Date(2026, 5, 14).getTime();
    const until = new Date(2026, 5, 15).getTime();
    expect(
      readBreakdowns(db, { sinceMs: since, untilMs: until }).byModel,
    ).toHaveLength(1);
    expect(
      readDaily(db, { sinceMs: since, untilMs: until }).map((d) => d.day),
    ).toEqual(["2026-06-14"]);
  });
});

describe("readCalendar", () => {
  const noon = (y: number, m: number, d: number): number =>
    new Date(y, m - 1, d, 12, 0, 0).getTime();
  const since = new Date(2026, 0, 1).getTime();
  const until = new Date(2027, 0, 1).getTime();

  it("returns turns and tokens per local day", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // Two opus turns on the 14th: 1M input + 1M output → tokens = 2,000,000.
      turn({
        messageId: "a",
        ts: noon(2026, 6, 14),
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      turn({
        messageId: "b",
        ts: noon(2026, 6, 14),
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 0,
          outputTokens: 1_000_000,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const cal = readCalendar(db, { sinceMs: since, untilMs: until });
    expect(cal).toHaveLength(1);
    expect(cal[0].day).toBe("2026-06-14");
    expect(cal[0].turns).toBe(2);
    expect(cal[0].totalTokens).toBe(2_000_000);
    expect(cal[0].inputTokens).toBe(1_000_000);
    expect(cal[0].outputTokens).toBe(1_000_000);
  });

  it("carries the fresh input/output subset apart from the total, so the cache toggle can pick either", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "cache-heavy",
        ts: noon(2026, 6, 14),
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 1000,
          cacheCreationTokens: 500,
        },
      }),
    ]);
    const cal = readCalendar(db, { sinceMs: since, untilMs: until });
    expect(cal[0].totalTokens).toBe(1515); // all four kinds (cache included)
    expect(cal[0].inputTokens).toBe(10);
    expect(cal[0].outputTokens).toBe(5); // fresh subset = 15, far below the total
  });

  it("still counts tokens on a day whose only model is unrecognized", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "x",
        ts: noon(2026, 6, 14),
        modelRaw: "some-unknown-model",
        usage: {
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const cal = readCalendar(db, { sinceMs: since, untilMs: until });
    expect(cal[0].totalTokens).toBe(100);
    expect(cal[0].turns).toBe(1);
  });

  it("counts tokens across recognized and unrecognized models on a mixed day", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // Recognized opus: 1M input tokens.
      turn({
        messageId: "known",
        ts: noon(2026, 6, 14),
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      // Unrecognized model: its tokens still count.
      turn({
        messageId: "unknown",
        ts: noon(2026, 6, 14),
        modelRaw: "some-unknown-model",
        usage: {
          inputTokens: 500,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const cal = readCalendar(db, { sinceMs: since, untilMs: until });
    expect(cal).toHaveLength(1);
    expect(cal[0].turns).toBe(2);
    expect(cal[0].totalTokens).toBe(1_000_500);
  });

  it("buckets by local day, ascending, and honors the window's bounds", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({ messageId: "before", ts: noon(2025, 12, 31), usage: oneIn() }),
      turn({ messageId: "d1", ts: noon(2026, 6, 14), usage: oneIn() }),
      turn({ messageId: "d2", ts: noon(2026, 6, 15), usage: oneIn() }),
      turn({ messageId: "after", ts: noon(2027, 1, 1), usage: oneIn() }),
    ]);
    expect(
      readCalendar(db, { sinceMs: since, untilMs: until }).map((d) => d.day),
    ).toEqual(["2026-06-14", "2026-06-15"]);
  });

  it("returns an empty array for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readCalendar(db, { sinceMs: since, untilMs: until })).toEqual([]);
  });
});

describe("readCalendarYears", () => {
  const noon = (y: number, m: number, d: number): number =>
    new Date(y, m - 1, d, 12, 0, 0).getTime();

  it("lists distinct local years with any turn, descending, excluding ts=0", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({ messageId: "y24", ts: noon(2024, 3, 2), usage: oneIn() }),
      turn({ messageId: "y26a", ts: noon(2026, 1, 9), usage: oneIn() }),
      turn({ messageId: "y26b", ts: noon(2026, 6, 14), usage: oneIn() }),
      turn({ messageId: "notime", ts: 0, usage: oneIn() }),
    ]);
    expect(readCalendarYears(db)).toEqual([2026, 2024]);
  });

  it("is empty for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readCalendarYears(db)).toEqual([]);
  });
});

describe("clearAnalytics", () => {
  it("empties turns and processed_files in one call", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [turn({ messageId: "a" }), turn({ messageId: "b" })]);
    upsertProcessedFile(db, "/a.jsonl", 111, 3);
    expect(hasAnyTurns(db)).toBe(true);
    expect(readProcessedFiles(db).size).toBe(1);

    clearAnalytics(db);

    expect(hasAnyTurns(db)).toBe(false);
    expect(readTotals(db).turns).toBe(0);
    expect(readProcessedFiles(db).size).toBe(0);
  });

  it("is a no-op on an already-empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    clearAnalytics(db); // must not throw on empty tables
    expect(readTotals(db).turns).toBe(0);
    expect(readProcessedFiles(db).size).toBe(0);
  });
});

describe("readRecords", () => {
  // Local-midnight ms for a day key, mirroring how the store buckets by 'localtime'.
  const dayMs = (y: number, m: number, d: number, h = 12) =>
    new Date(y, m - 1, d, h).getTime();
  // Poll instant for the tests: 14 Jun 2026, 14:30 local.
  const NOW = new Date(2026, 5, 14, 14, 30).getTime();

  it("returns empty records on an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readRecords(db, ALL_TIME, NOW)).toEqual({
      activeDays: 0,
      windowDays: 0,
      mostActiveDay: null,
      longestSessionMs: 0,
      longestStreakDays: 0,
      currentStreakDays: 0,
    });
  });

  it("counts active days and picks the most active day (ties to the most recent)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({ messageId: "a1", ts: dayMs(2026, 6, 12) }),
      turn({ messageId: "a2", ts: dayMs(2026, 6, 12, 13) }),
      turn({ messageId: "b1", ts: dayMs(2026, 6, 13) }),
      turn({ messageId: "b2", ts: dayMs(2026, 6, 13, 13) }),
      turn({ messageId: "c1", ts: dayMs(2026, 6, 14) }),
    ]);
    const r = readRecords(db, ALL_TIME, NOW);
    expect(r.activeDays).toBe(3);
    // Jun 12 and Jun 13 tie on 2 turns — the most recent (Jun 13) wins.
    expect(r.mostActiveDay).toBe("2026-06-13");
    // All-time windowDays: first turn day (Jun 12) .. today (Jun 14) inclusive.
    expect(r.windowDays).toBe(3);
  });

  it("scopes activeDays/mostActiveDay to the window but streaks to all time", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    // Jun 10-14: five consecutive active days; window covers only Jun 13-14.
    upsertTurns(db, [
      turn({ messageId: "d0", ts: dayMs(2026, 6, 10) }),
      turn({ messageId: "d1", ts: dayMs(2026, 6, 11) }),
      turn({ messageId: "d2", ts: dayMs(2026, 6, 12) }),
      turn({ messageId: "d3", ts: dayMs(2026, 6, 13) }),
      turn({ messageId: "d4", ts: dayMs(2026, 6, 14) }),
      turn({ messageId: "d5", ts: dayMs(2026, 6, 14, 13) }),
    ]);
    const win = { sinceMs: dayMs(2026, 6, 13, 0), untilMs: null };
    const r = readRecords(db, win, NOW);
    expect(r.activeDays).toBe(2);
    expect(r.mostActiveDay).toBe("2026-06-14"); // 2 turns beats 1
    expect(r.windowDays).toBe(2); // Jun 13 .. today (Jun 14)
    expect(r.longestStreakDays).toBe(5); // all-time, ignores the window
    expect(r.currentStreakDays).toBe(5); // ends today
  });

  it("anchors the current streak to yesterday when today is idle", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({ messageId: "e1", ts: dayMs(2026, 6, 12) }),
      turn({ messageId: "e2", ts: dayMs(2026, 6, 13) }),
    ]);
    const r = readRecords(db, ALL_TIME, NOW); // today = Jun 14, idle
    expect(r.currentStreakDays).toBe(2);
    expect(r.longestStreakDays).toBe(2);
  });

  it("takes the largest per-session span and ignores unknown-time turns", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // sess-1: a 2-hour span.
      turn({
        messageId: "f1",
        sessionId: "sess-1",
        ts: dayMs(2026, 6, 13, 10),
      }),
      turn({
        messageId: "f2",
        sessionId: "sess-1",
        ts: dayMs(2026, 6, 13, 12),
      }),
      // sess-2: a 30-hour span (the longest).
      turn({ messageId: "g1", sessionId: "sess-2", ts: dayMs(2026, 6, 13, 8) }),
      turn({
        messageId: "g2",
        sessionId: "sess-2",
        ts: dayMs(2026, 6, 14, 14),
      }),
      // sess-3: an unknown-time turn only — no span, and no epoch-stretch.
      turn({ messageId: "h1", sessionId: "sess-3", ts: 0 }),
    ]);
    const r = readRecords(db, ALL_TIME, NOW);
    expect(r.longestSessionMs).toBe(
      dayMs(2026, 6, 14, 14) - dayMs(2026, 6, 13, 8),
    );
  });

  it("computes windowDays from the window bounds for a bounded range", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [turn({ messageId: "i1", ts: dayMs(2026, 6, 14) })]);
    // A single-day window: [Jun 14 00:00, Jun 15 00:00) — the calendar drill-down shape.
    const win = {
      sinceMs: new Date(2026, 5, 14).getTime(),
      untilMs: new Date(2026, 5, 15).getTime(),
    };
    const r = readRecords(db, win, NOW);
    expect(r.windowDays).toBe(1);
    expect(r.activeDays).toBe(1);
  });
});
