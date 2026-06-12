import Database from "better-sqlite3";
import { wrap, type SqliteDb } from "./driver";

/** Open the on-disk index with better-sqlite3 (Electron main process) behind the SqliteDb seam. */
export function openDb(path: string): SqliteDb {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  return wrap(db);
}
