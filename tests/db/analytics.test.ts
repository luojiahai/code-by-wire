import { describe, it, expect } from "vitest";
import type { AnalyticsTurn } from "../../src/main/db/analytics";
import {
  migrateAnalytics,
  upsertTurns,
  readTotals,
  emptyTotals,
  readProcessedFiles,
  upsertProcessedFile,
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
    expect(readProcessedFiles(db).get("/a.jsonl")).toEqual({ mtime: 1, lines: 1 });
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
