import type { Usage } from "@shared/types";
import { sumUsages } from "@shared/usage-by-model";
import { num, cacheCreationSplit } from "./transcript-row";

/** A raw assistant `usage` block projected into the app's Usage shape — the one conversion every
 *  transcript reader shares (input/output/cacheRead plus the authoritative cache-creation split).
 *  Lives in the claude/ dir where no-unsafe-* is downgraded: it consumes `any` transcript JSON. */
export function readUsage(raw: unknown): Usage {
  const u = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const split = cacheCreationSplit(u);
  return {
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cacheReadTokens: num(u.cache_read_input_tokens),
    cacheCreationTokens: split.total,
    cacheCreation5mTokens: split.fiveM,
    cacheCreation1hTokens: split.oneH,
  };
}

interface Entry<T> {
  key: string | null;
  raw: unknown;
  value: T;
}

/**
 * Per-message usage dedup where the LAST entry wins. Claude Code writes one assistant turn across
 * several JSONL rows sharing one message id; main transcripts repeat the identical final usage, but
 * subagent transcripts write PROGRESSIVE streaming snapshots (output_tokens like [0, 0, 764]) and only
 * the final row — the one with a truthy stop_reason — carries the billed usage. Keeping the first row
 * (the old rule) recorded ~zero output for most subagent turns; keeping the last is correct for both
 * shapes, and a mid-stream partial self-corrects on the next read. transcript-speed.ts applies this
 * same rule with interval bookkeeping it owns.
 *
 * `add` stores the raw block per key (a repeat REPLACES it); `makeValue` runs on first sight only, so
 * a caller's per-turn metadata (ts, model, cwd…) stays first-seen while usage stays last-seen. A null
 * key (an id-less row) is its own entry every time.
 */
export class UsageAccumulator<T = undefined> {
  private byKey = new Map<string, Entry<T>>();
  private keyless: Entry<T>[] = [];

  add(key: string | null, raw: unknown, makeValue?: () => T): void {
    const existing = key === null ? undefined : this.byKey.get(key);
    if (existing) {
      existing.raw = raw;
      return;
    }
    const entry: Entry<T> = {
      key,
      raw,
      value: (makeValue ? makeValue() : undefined) as T,
    };
    if (key === null) this.keyless.push(entry);
    else this.byKey.set(key, entry);
  }

  has(key: string): boolean {
    return this.byKey.has(key);
  }

  /** Every deduped message — keyed entries in first-seen order, then id-less ones — with its usage
   *  read from the LATEST raw block. */
  entries(): { key: string | null; usage: Usage; value: T }[] {
    return [...this.byKey.values(), ...this.keyless].map((e) => ({
      key: e.key,
      usage: readUsage(e.raw),
      value: e.value,
    }));
  }

  /** Field-by-field Usage total over the latest snapshot of every message. */
  totals(): Usage {
    return sumUsages(this.entries().map((e) => e.usage));
  }
}
