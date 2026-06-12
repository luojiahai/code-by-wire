import { describe, it, expect } from "vitest";
import { transaction } from "../../src/main/db/driver";
import { openTestDb } from "../helpers/sqlite";

describe("SqliteDb seam (node:sqlite)", () => {
  it("execs, prepares, and round-trips @named params", () => {
    const db = openTestDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER NOT NULL)");
    db.prepare("INSERT INTO t (id, n) VALUES (@id, @n)").run({ id: "a", n: 1 });
    expect({
      ...(db.prepare("SELECT id, n FROM t WHERE id = ?").get("a") as object),
    }).toEqual({
      id: "a",
      n: 1,
    });
  });

  it("commits a transaction", () => {
    const db = openTestDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY)");
    const ins = db.prepare("INSERT INTO t (id) VALUES (?)");
    transaction(db, () => {
      ins.run("a");
      ins.run("b");
    });
    expect(db.prepare("SELECT count(*) AS c FROM t").get()).toMatchObject({
      c: 2,
    });
  });

  it("rolls back a transaction that throws, leaving no partial writes", () => {
    const db = openTestDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY)");
    const ins = db.prepare("INSERT INTO t (id) VALUES (?)");
    expect(() =>
      transaction(db, () => {
        ins.run("a");
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(db.prepare("SELECT count(*) AS c FROM t").get()).toMatchObject({
      c: 0,
    });
  });

  it("composes nested transactions, rolling back only the inner work on inner failure", () => {
    const db = openTestDb();
    db.exec("CREATE TABLE t (id TEXT PRIMARY KEY)");
    const ins = db.prepare("INSERT INTO t (id) VALUES (?)");
    transaction(db, () => {
      ins.run("outer");
      // A nested transaction that throws must undo only its own row, not the caller's transaction.
      expect(() =>
        transaction(db, () => {
          ins.run("inner");
          throw new Error("boom");
        }),
      ).toThrow("boom");
      ins.run("after-inner");
    });
    expect(db.prepare("SELECT id FROM t ORDER BY id").all()).toEqual([
      { id: "after-inner" },
      { id: "outer" },
    ]);
  });

  it("surfaces the real error when SQLite has already auto-aborted, not a masking ROLLBACK error", () => {
    const db = openTestDb();
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT)");
    // Cap the database so the write overflows: SQLITE_FULL auto-aborts the transaction, so the
    // catch-path ROLLBACK would itself throw 'no transaction is active' and bury the real cause.
    db.exec("PRAGMA max_page_count = 16");
    expect(() =>
      transaction(db, () => {
        db.prepare("INSERT INTO t (id, body) VALUES (?, ?)").run(
          1,
          "x".repeat(1_000_000),
        );
      }),
    ).toThrow(/full/i);
  });
});
