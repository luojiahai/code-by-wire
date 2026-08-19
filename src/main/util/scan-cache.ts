import { readFileSync, statSync } from "node:fs";
import { MAX_TEXT_FILE_BYTES } from "./file-size";

/**
 * Per-file incremental parse cache keyed by (path → size, mtimeMs), agent-neutral: re-runs the
 * supplied parse only when the file actually changed (CodexBar's scheme). Entries are small parsed
 * summaries and the population is bounded (one per session file), so there is no eviction beyond
 * dropping entries whose file errors. Any fs error reads as null — callers degrade per-file.
 */
export interface ScanCache<T> {
  read(path: string): T | null;
}

export function createScanCache<T>(
  parse: (text: string) => T,
  maxBytes: number = MAX_TEXT_FILE_BYTES,
): ScanCache<T> {
  const byPath = new Map<string, { size: number; mtimeMs: number; value: T }>();
  return {
    read(path: string): T | null {
      let size: number;
      let mtimeMs: number;
      try {
        const st = statSync(path);
        size = st.size;
        mtimeMs = st.mtimeMs;
      } catch {
        byPath.delete(path);
        return null;
      }
      const hit = byPath.get(path);
      if (hit && hit.size === size && hit.mtimeMs === mtimeMs) return hit.value;
      // Too big to turn into a string: the read below would abort the whole process rather than
      // throw (see MAX_TEXT_FILE_BYTES). Degrade exactly like any other fs error here — null, and
      // per-file — so one runaway transcript can't take the app down.
      if (size > maxBytes) {
        byPath.delete(path);
        return null;
      }
      let text: string;
      try {
        text = readFileSync(path, "utf8");
      } catch {
        byPath.delete(path);
        return null;
      }
      const value = parse(text);
      byPath.set(path, { size, mtimeMs, value });
      return value;
    },
  };
}
