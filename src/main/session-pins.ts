import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTextOrNull } from "./claude-config";

/**
 * User-chosen pinned-session marks, keyed by session id, valued by the pin's epoch-ms stamp (the
 * PINNED section orders by it, newest first). Stored under Electron's userData beside
 * session-titles.json, separate from the disposable SQLite index: durable user data that must
 * survive a cache rebuild. A missing key means "not pinned"; ids whose sessions are gone are
 * inert (never surfaced), matching the title store's no-GC policy.
 */
export interface SessionPinStore {
  /** Every pin as an id → pinnedAtMs map. {} when the file is absent or corrupt. */
  read(): Record<string, number>;
  /** Pin stamps the clock; unpin drops the key. */
  set(id: string, pinned: boolean): void;
  /** Migrate an entry across a session-id re-key (the codex claim; potentially /clear later).
   *  No-op when `from` has no entry or `to` already has one. */
  rename(from: string, to: string): void;
}

export interface SessionPinDeps {
  /** Directory to store session-pins.json in (the composition root passes app.getPath("userData")). */
  dir: string;
  /** Clock for pin stamps — injectable for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

export function createSessionPinStore(deps: SessionPinDeps): SessionPinStore {
  const file = join(deps.dir, "session-pins.json");
  const now = deps.now ?? Date.now;

  function read(): Record<string, number> {
    const raw = readTextOrNull(file);
    if (raw === null) return {};
    try {
      const v: unknown = JSON.parse(raw);
      if (!v || typeof v !== "object" || Array.isArray(v)) return {};
      // Keep only finite numbers, so a hand-edited file can't inject a non-timestamp into a pin slot.
      const out: Record<string, number> = {};
      for (const [k, val] of Object.entries(v))
        if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
      return out;
    } catch {
      return {}; // a corrupt file reads as "no pins" rather than crashing the app
    }
  }

  function write(next: Record<string, number>): void {
    mkdirSync(deps.dir, { recursive: true });
    writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  }

  return {
    read,
    set(id, pinned) {
      const next = read();
      if (pinned) next[id] = now();
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
