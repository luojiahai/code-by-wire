import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTextOrNull } from "./claude-config";

/**
 * Per-session custom launch args, keyed by session id, valued by the raw (trimmed) args string the
 * user typed at spawn. Read back on Resume/Fork so `--dangerously-skip-permissions` and settings
 * overlays survive the whole session lifecycle (spec: custom-launch-args). Stored under Electron's
 * userData beside session-pins.json: durable user data, separate from the disposable SQLite index.
 * A missing key means "no custom args" — sessions predating the feature resume bare, as before.
 */
export interface LaunchArgsStore {
  /** The stored args string for `id`, or null when none. */
  get(id: string): string | null;
  /** Persist the (trimmed) args for `id`; a value that trims to empty deletes the entry. */
  set(id: string, args: string): void;
  /** Migrate an entry across a session-id re-key (codex claim, /clear rotation).
   *  No-op when `from` has no entry or `to` already has one. */
  rename(from: string, to: string): void;
}

export function createLaunchArgsStore(deps: { dir: string }): LaunchArgsStore {
  const file = join(deps.dir, "launch-args.json");

  function read(): Record<string, string> {
    const raw = readTextOrNull(file);
    if (raw === null) return {};
    try {
      const v: unknown = JSON.parse(raw);
      if (!v || typeof v !== "object" || Array.isArray(v)) return {};
      // Keep only strings, so a hand-edited file can't inject a non-args value.
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(v))
        if (typeof val === "string") out[k] = val;
      return out;
    } catch {
      return {}; // a corrupt file reads as "no custom args" rather than crashing the app
    }
  }

  function write(next: Record<string, string>): void {
    mkdirSync(deps.dir, { recursive: true });
    writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  }

  return {
    get: (id) => read()[id] ?? null,
    set(id, args) {
      const next = read();
      const trimmed = args.trim();
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
