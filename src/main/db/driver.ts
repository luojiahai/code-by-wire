/**
 * The minimal SQLite surface the index uses, satisfied by two drivers: better-sqlite3 in the
 * Electron main process (its bundled Node 20 predates the built-in), and the built-in node:sqlite
 * in the Vitest test process (system Node 24). Programming the store against this interface — not a
 * concrete driver — is what lets the same persistence code run against a scratch SQLite in tests
 * while production keeps better-sqlite3. Stick to the common subset: no `.transaction()` sugar (use
 * `transaction()` below) and no `.pragma()` (use `exec('PRAGMA …')`).
 */
export interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

// The loose shape both concrete drivers expose. `any` on the variadic params dodges the drivers'
// stricter `SupportedValueType[]` typings without leaking a cast into every call site.
type RawStatement = {
  run(...p: any[]): any;
  get(...p: any[]): any;
  all(...p: any[]): any[];
};
type RawDb = { exec(sql: string): unknown; prepare(sql: string): RawStatement };

/** Adapt a concrete driver handle (better-sqlite3 Database or node:sqlite DatabaseSync) to SqliteDb. */
export function wrap(db: RawDb): SqliteDb {
  return {
    exec: (sql) => {
      db.exec(sql);
    },
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      return {
        run: (...p) => stmt.run(...p),
        get: (...p) => stmt.get(...p),
        all: (...p) => stmt.all(...p),
      };
    },
  };
}

// Per-handle nesting depth, so `transaction()` composes: the outermost call owns the real
// BEGIN/COMMIT and inner calls become SAVEPOINTs. Keyed on the handle (one stable SqliteDb per
// open db), not module-global, so concurrent handles don't share a counter.
const txDepth = new WeakMap<SqliteDb, number>();

/**
 * Run `fn` inside a transaction. better-sqlite3's `db.transaction()` wrapper doesn't exist on
 * node:sqlite, so both drivers share this explicit BEGIN/COMMIT (ROLLBACK on throw) instead. Calls
 * nest: an inner `transaction()` opens a SAVEPOINT and unwinds only its own work on throw, leaving
 * the caller's transaction intact, so composing two store writes into one atomic pass is safe.
 */
export function transaction(db: SqliteDb, fn: () => void): void {
  const depth = txDepth.get(db) ?? 0;
  const savepoint = `cbw_sp_${depth}`;
  db.exec(depth === 0 ? "BEGIN" : `SAVEPOINT ${savepoint}`);
  txDepth.set(db, depth + 1);
  try {
    fn();
    db.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`);
  } catch (err) {
    try {
      if (depth === 0) {
        db.exec("ROLLBACK");
      } else {
        db.exec(`ROLLBACK TO ${savepoint}`);
        db.exec(`RELEASE ${savepoint}`);
      }
    } catch {
      // SQLite may have already auto-aborted (e.g. SQLITE_FULL), in which case the unwind throws
      // 'no transaction is active'. Swallow it so the real cause below survives.
    }
    throw err;
  } finally {
    txDepth.set(db, depth);
  }
}
