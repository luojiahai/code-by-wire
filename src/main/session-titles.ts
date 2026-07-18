import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTextOrNull } from "./claude-config";
import { MAX_SESSION_TITLE_LEN } from "@shared/title-override";

/**
 * User-chosen display-name overrides for sessions, keyed by session id. Stored under Electron's
 * userData, separate from the disposable SQLite index and from app-settings: durable user
 * data that must survive the cache rebuild AND the per-sync title re-derive. A missing key means "no
 * override" — fall back to the derived/live title.
 */
export interface SessionTitleStore {
  /** Every override as an id → name map. {} when the file is absent or corrupt. */
  read(): Record<string, string>;
  /** Persist a trimmed override, or drop the key when title is null or trims to empty. */
  set(id: string, title: string | null): void;
  /** Migrate an entry across a session-id re-key (the codex claim; potentially /clear later).
   *  No-op when `from` has no entry or `to` already has one. */
  rename(from: string, to: string): void;
}

export interface SessionTitleDeps {
  /** Directory to store session-titles.json in (the composition root passes app.getPath("userData")). */
  dir: string;
}

export function createSessionTitleStore(
  deps: SessionTitleDeps,
): SessionTitleStore {
  const file = join(deps.dir, "session-titles.json");

  function read(): Record<string, string> {
    const raw = readTextOrNull(file);
    if (raw === null) return {};
    try {
      const v: unknown = JSON.parse(raw);
      if (!v || typeof v !== "object" || Array.isArray(v)) return {};
      // Keep only string values, so a hand-edited file can't inject a non-string into the title slot.
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(v))
        if (typeof val === "string")
          out[k] = val.slice(0, MAX_SESSION_TITLE_LEN);
      return out;
    } catch {
      return {}; // a corrupt file reads as "no overrides" rather than crashing the app
    }
  }

  function write(next: Record<string, string>): void {
    mkdirSync(deps.dir, { recursive: true });
    writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  }

  return {
    read,
    set(id, title) {
      const next = read();
      const trimmed = title?.trim().slice(0, MAX_SESSION_TITLE_LEN);
      if (trimmed) next[id] = trimmed;
      else delete next[id];
      write(next);
    },
    rename(from, to) {
      const next = read();
      if (next[from] === undefined || next[to] !== undefined) return;
      next[to] = next[from];
      delete next[from];
      write(next);
    },
  };
}
