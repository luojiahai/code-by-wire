import { describe, it, expect } from "vitest";
import type { AnalyticsTurn } from "../../src/main/db/analytics";
import {
  migrateAnalytics,
  upsertTurns,
  readTotals,
  readByModel,
  readByProject,
  readByBranch,
  readBreakdowns,
  emptyTotals,
  readProcessedFiles,
  upsertProcessedFile,
  hasAnyTurns,
} from "../../src/main/db/analytics";
import { openTestDb } from "../helpers/sqlite";

const turn = (over: Partial<AnalyticsTurn> = {}): AnalyticsTurn => ({
  messageId: "msg-1",
  sessionId: "sess-1",
  ts: 1000,
  modelRaw: "claude-opus-4-8",
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  },
  cwd: "/work/code-by-wire",
  project: "code-by-wire",
  branch: "main",
  ...over,
});

describe("analytics store", () => {
  it("migrates to schema v2 and is idempotent", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    migrateAnalytics(db); // second call is a no-op, not an error
    expect(
      (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    ).toBe(2);
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
    migrateAnalytics(db); // already at v2 → the guard skips the block; nothing is wiped
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
    upsertTurns(db, [turn()]);
    expect(readTotals(db).turns).toBe(1);

    migrateAnalytics(db); // 1 → 2: clears turns so the next scan rebuilds under the new surrogate scheme
    expect(readTotals(db).turns).toBe(0);
    expect(readProcessedFiles(db).size).toBe(0); // new table exists and is empty
    expect(
      (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    ).toBe(2);
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
    upsertTurns(db, [turn()]);

    migrateAnalytics(db); // enters the block (0 < 2) but `from !== 1`, so turns survive
    expect(readTotals(db).turns).toBe(1);
    expect(
      (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    ).toBe(2);
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

  it("computes Equivalent API value from family-substring pricing", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    // 1,000,000 input tokens on opus at $5/M = $5.00 exactly.
    upsertTurns(db, [
      turn({
        modelRaw: "claude-opus-4-8",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    expect(readTotals(db).equivApiValueUsd).toBeCloseTo(5);
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
    const scoped = readTotals(db, 2000);
    expect(scoped.turns).toBe(2);
    expect(scoped.inputTokens).toBe(110);
    // one ms past the edge: the edge falls out, only the newest remains.
    expect(readTotals(db, 2001).turns).toBe(1);
    expect(readTotals(db, 2001).inputTokens).toBe(100);
  });

  it("counts all-time with no bound (a null bound matches the no-arg call)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({ messageId: "a", ts: 1000 }),
      turn({ messageId: "b", ts: 9_999_999 }),
    ]);
    expect(readTotals(db).turns).toBe(2);
    expect(readTotals(db, null).turns).toBe(2);
  });

  it("scopes sessions and Equivalent API value to the window", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // out of window: a different session, 1M opus input ($5) — must not leak into the scoped value.
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
      // in window: a sonnet turn, 1M input ($3).
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
    const scoped = readTotals(db, 5000);
    expect(scoped.sessions).toBe(1); // only s-new is active in the window
    expect(scoped.inputTokens).toBe(1_000_000);
    expect(scoped.equivApiValueUsd).toBeCloseTo(3); // sonnet only; the out-of-window opus $5 is excluded
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
    expect(readTotals(db, 1).turns).toBe(0);
    expect(readTotals(db, 1).inputTokens).toBe(0);
    expect(hasAnyTurns(db)).toBe(true);
  });

  it("counts an unrecognized model's tokens but gives it n/a cost", () => {
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
    expect(t.equivApiValueUsd).toBeCloseTo(3); // only sonnet ($3/M); the unknown adds nothing
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

  it("maps cost per model and gives an unrecognized id null (n/a), still counting its tokens", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // sonnet: 1M input at $3/M = $3.00.
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
      // unrecognized id: matches no family → cost null, but its 2M tokens still appear.
      turn({
        messageId: "unknown",
        modelRaw: "gpt-9-ultra",
        usage: {
          inputTokens: 2_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const byRaw = new Map(readByModel(db).map((r) => [r.modelRaw, r]));
    expect(byRaw.get("claude-sonnet-4-6")!.equivApiValueUsd).toBeCloseTo(3);
    expect(byRaw.get("gpt-9-ultra")!.equivApiValueUsd).toBeNull();
    expect(byRaw.get("gpt-9-ultra")!.totalTokens).toBe(2_000_000);
  });

  it("buckets a turn that recorded no model under modelRaw null with n/a cost", () => {
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
    expect(rows[0].equivApiValueUsd).toBeNull();
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
    const rows = readByModel(db, 5000); // since == the new turn's ts: only it survives
    expect(rows).toHaveLength(1);
    expect(rows[0].modelRaw).toBe("claude-sonnet-4-6");
    expect(rows[0].totalTokens).toBe(100);
  });

  it("returns an empty array for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readByModel(db)).toEqual([]);
  });

  it("sums the same Equivalent API value readTotals reports (the breakdown reconciles)", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "a",
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
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
      // an unrecognized id contributes null to the breakdown and nothing to readTotals' cost.
      turn({
        messageId: "c",
        modelRaw: "gpt-9-ultra",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    // Per-row, not just the sum: a regression that swaps which model gets which cost (opus's onto sonnet's
    // row and back) preserves the total, so the sum check alone would miss it. Pin each row.
    const byRaw = new Map(readByModel(db).map((r) => [r.modelRaw, r]));
    expect(byRaw.get("claude-opus-4-8")!.equivApiValueUsd).toBeCloseTo(5); // 1M input @ $5/M
    expect(byRaw.get("claude-sonnet-4-6")!.equivApiValueUsd).toBeCloseTo(3); // 1M input @ $3/M
    expect(byRaw.get("gpt-9-ultra")!.equivApiValueUsd).toBeNull(); // unrecognized → n/a
    const summed = readByModel(db).reduce(
      (acc, r) => acc + (r.equivApiValueUsd ?? 0),
      0,
    );
    expect(summed).toBeCloseTo(readTotals(db).equivApiValueUsd); // $5 opus + $3 sonnet = $8
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
    expect(rows[0].equivApiValueUsd).toBeCloseTo(8);
    // the breakdown reconciles with the grand total it partitions.
    expect(rows[0].equivApiValueUsd!).toBeCloseTo(
      readTotals(db).equivApiValueUsd,
    );
  });

  it("gives a project with only unrecognized models n/a cost, still counting its tokens", () => {
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
    expect(rows[0].equivApiValueUsd).toBeNull(); // no recognized model → n/a, not $0
  });

  it("on a mixed project counts both models' tokens but prices only the recognized one", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      // one project, one recognized + one unrecognized model: tokens sum both, cost is the known one only,
      // and equivApiValueUsd is non-null (hasKnownCost flips true) — n/a is reserved for an ALL-unknown group.
      turn({
        messageId: "known",
        cwd: "/w/proj",
        project: "proj",
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1_000_000, // $3 at sonnet's $3/M input
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
    expect(rows[0].equivApiValueUsd).toBeCloseTo(3); // sonnet only; the unknown adds nothing to cost
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
    const rows = readByProject(db, 5000); // since == the new turn's ts: only it survives
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

  it("folds cost per model and reconciles with the totals", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, [
      turn({
        messageId: "o",
        cwd: "/w/proj",
        project: "proj",
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
        messageId: "s",
        cwd: "/w/proj",
        project: "proj",
        branch: "feature",
        modelRaw: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ]);
    const summed = readByBranch(db).reduce(
      (acc, r) => acc + (r.equivApiValueUsd ?? 0),
      0,
    );
    expect(summed).toBeCloseTo(readTotals(db).equivApiValueUsd); // $5 opus + $3 sonnet = $8
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
    const rows = readByBranch(db, 5000);
    expect(rows).toHaveLength(1);
    expect(rows[0].branch).toBe("feature");
    expect(rows[0].totalTokens).toBe(100);
  });

  it("returns an empty array for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readByBranch(db)).toEqual([]);
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
    expect(b.byBranch).toEqual(readByBranch(db));
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
    const b = readBreakdowns(db, 5000);
    expect(b.byModel).toEqual(readByModel(db, 5000));
    expect(b.byProject).toEqual(readByProject(db, 5000));
    expect(b.byBranch).toEqual(readByBranch(db, 5000));
  });

  it("reconciles every breakdown's summed cost with the grand total", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    upsertTurns(db, seed());
    // $5 opus (1M input) + $6 sonnet (2M input); the unrecognized model contributes tokens but no cost.
    const total = readTotals(db).equivApiValueUsd;
    const sum = (rows: { equivApiValueUsd: number | null }[]): number =>
      rows.reduce((acc, r) => acc + (r.equivApiValueUsd ?? 0), 0);
    const b = readBreakdowns(db);
    expect(sum(b.byModel)).toBeCloseTo(total);
    expect(sum(b.byProject)).toBeCloseTo(total);
    expect(sum(b.byBranch)).toBeCloseTo(total);
    expect(total).toBeCloseTo(11);
  });

  it("returns three empty breakdowns for an empty store", () => {
    const db = openTestDb();
    migrateAnalytics(db);
    expect(readBreakdowns(db)).toEqual({
      byModel: [],
      byProject: [],
      byBranch: [],
    });
  });
});
