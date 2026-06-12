import { createRequire } from "node:module";
import { wrap, type SqliteDb } from "../../src/main/db/driver";

// Vite's resolver doesn't recognize the newer `node:sqlite` builtin and tries to load it as a file,
// so reach it through Node's own require at runtime instead of a static import.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

/** A fresh in-memory scratch index for a test, behind the same SqliteDb seam production uses. */
export function openTestDb(): SqliteDb {
  return wrap(new DatabaseSync(":memory:"));
}
