import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  codexUsageUrl,
  fetchAppServerLimits,
  parseAppServerRateLimits,
  parseWhamUsage,
  readCodexAuth,
  type AppServerChild,
  type AppServerSpawn,
} from "../../src/main/provider/codex/limits";

const NOW = Date.parse("2026-07-19T10:00:00.000Z");

describe("parseWhamUsage", () => {
  it("maps primary/secondary windows by length into fiveHour/sevenDay, epoch seconds → ms", () => {
    const w = parseWhamUsage(
      {
        plan_type: "pro",
        rate_limit: {
          primary_window: {
            used_percent: 42,
            limit_window_seconds: 18_000,
            reset_at: 1_800_000_000,
          },
          secondary_window: {
            used_percent: 7,
            limit_window_seconds: 604_800,
            reset_at: 1_800_500_000,
          },
        },
      },
      NOW,
    );
    expect(w).toEqual({
      fiveHour: { usedPct: 42, resetsAt: 1_800_000_000_000 },
      sevenDay: { usedPct: 7, resetsAt: 1_800_500_000_000 },
    });
  });

  it("classifies by length even when the API swaps primary/secondary", () => {
    const w = parseWhamUsage(
      {
        rate_limit: {
          primary_window: {
            used_percent: 7,
            limit_window_seconds: 604_800,
            reset_at: 1_800_500_000,
          },
          secondary_window: {
            used_percent: 42,
            limit_window_seconds: 18_000,
            reset_at: 1_800_000_000,
          },
        },
      },
      NOW,
    );
    expect(w?.fiveHour?.usedPct).toBe(42);
    expect(w?.sevenDay?.usedPct).toBe(7);
  });

  it("falls back to position for unrecognized window lengths (never drops a window)", () => {
    const w = parseWhamUsage(
      {
        rate_limit: {
          primary_window: {
            used_percent: 10,
            limit_window_seconds: 3_600,
            reset_at: 1_800_000_000,
          },
          secondary_window: {
            used_percent: 20,
            limit_window_seconds: 86_400,
            reset_at: 1_800_500_000,
          },
        },
      },
      NOW,
    );
    expect(w?.fiveHour?.usedPct).toBe(10);
    expect(w?.sevenDay?.usedPct).toBe(20);
  });

  it("derives resetsAt from reset_after_seconds when reset_at is absent", () => {
    const w = parseWhamUsage(
      {
        rate_limit: {
          primary_window: {
            used_percent: 5,
            limit_window_seconds: 18_000,
            reset_after_seconds: 3_600,
          },
        },
      },
      NOW,
    );
    expect(w?.fiveHour).toEqual({ usedPct: 5, resetsAt: NOW + 3_600_000 });
  });

  it("discards a half-formed window but keeps its sibling; all-malformed → null", () => {
    const w = parseWhamUsage(
      {
        rate_limit: {
          primary_window: { used_percent: "not-a-number" },
          secondary_window: {
            used_percent: 7,
            limit_window_seconds: 604_800,
            reset_at: 1_800_500_000,
          },
        },
      },
      NOW,
    );
    expect(w?.fiveHour).toBeUndefined();
    expect(w?.sevenDay?.usedPct).toBe(7);
    expect(parseWhamUsage({ rate_limit: {} }, NOW)).toBeNull();
    expect(parseWhamUsage("garbage", NOW)).toBeNull();
    expect(parseWhamUsage(null, NOW)).toBeNull();
  });

  it("assigns a lone surviving window to ITS OWN slot, not by iteration order, when its sibling is discarded", () => {
    const w = parseWhamUsage(
      {
        rate_limit: {
          primary_window: { used_percent: "not-a-number" }, // discarded entirely — malformed
          secondary_window: {
            used_percent: 22,
            limit_window_seconds: 120,
            reset_at: 1_800_500_000,
          }, // unrecognized length (2 min)
        },
      },
      NOW,
    );
    expect(w?.fiveHour).toBeUndefined();
    expect(w?.sevenDay).toEqual({ usedPct: 22, resetsAt: 1_800_500_000_000 });
  });

  it("keeps BOTH windows when primary and secondary share the same recognized length", () => {
    const w = parseWhamUsage(
      {
        rate_limit: {
          primary_window: {
            used_percent: 1,
            limit_window_seconds: 18_000,
            reset_at: 1_800_000_000,
          },
          secondary_window: {
            used_percent: 2,
            limit_window_seconds: 18_000,
            reset_at: 1_800_500_000,
          },
        },
      },
      NOW,
    );
    expect(w?.fiveHour).toEqual({ usedPct: 1, resetsAt: 1_800_000_000_000 });
    expect(w?.sevenDay).toEqual({ usedPct: 2, resetsAt: 1_800_500_000_000 });
  });
});

describe("parseAppServerRateLimits", () => {
  it("reads the rate_limits envelope with window_minutes, snake case", () => {
    const w = parseAppServerRateLimits(
      {
        rate_limits: {
          primary: {
            used_percent: 33,
            window_minutes: 300,
            resets_at: 1_800_000_000,
          },
          secondary: {
            used_percent: 9,
            window_minutes: 10_080,
            resets_at: 1_800_500_000,
          },
        },
      },
      NOW,
    );
    expect(w?.fiveHour).toEqual({ usedPct: 33, resetsAt: 1_800_000_000_000 });
    expect(w?.sevenDay?.usedPct).toBe(9);
  });

  it("accepts camelCase variants (usedPercent / windowDurationMins / resetsAt in ms)", () => {
    const w = parseAppServerRateLimits(
      {
        rateLimits: {
          primary: {
            usedPercent: 33,
            windowDurationMins: 300,
            resetsAt: 1_800_000_000_000,
          },
        },
      },
      NOW,
    );
    expect(w?.fiveHour).toEqual({ usedPct: 33, resetsAt: 1_800_000_000_000 });
  });

  it("falls back to the 'codex' entry of rate_limits_by_limit_id", () => {
    const w = parseAppServerRateLimits(
      {
        rate_limits_by_limit_id: {
          codex: {
            primary: {
              used_percent: 12,
              window_minutes: 300,
              resets_at: 1_800_000_000,
            },
          },
        },
      },
      NOW,
    );
    expect(w?.fiveHour?.usedPct).toBe(12);
  });

  it("returns null for garbage", () => {
    expect(parseAppServerRateLimits(undefined, NOW)).toBeNull();
    expect(parseAppServerRateLimits({}, NOW)).toBeNull();
  });
});

describe("readCodexAuth / codexUsageUrl", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "codex-limits-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads tokens.access_token + tokens.account_id (snake or camel)", () => {
    writeFileSync(
      join(dir, "auth.json"),
      JSON.stringify({ tokens: { access_token: "at-1", account_id: "acc-1" } }),
    );
    expect(readCodexAuth(dir)).toEqual({
      accessToken: "at-1",
      accountId: "acc-1",
    });
    writeFileSync(
      join(dir, "auth.json"),
      JSON.stringify({ tokens: { accessToken: "at-2", accountId: "acc-2" } }),
    );
    expect(readCodexAuth(dir)).toEqual({
      accessToken: "at-2",
      accountId: "acc-2",
    });
  });

  it("returns null when auth.json is absent, malformed, or API-key-only", () => {
    expect(readCodexAuth(dir)).toBeNull();
    writeFileSync(join(dir, "auth.json"), "{broken");
    expect(readCodexAuth(dir)).toBeNull();
    writeFileSync(
      join(dir, "auth.json"),
      JSON.stringify({ OPENAI_API_KEY: "sk-..." }),
    );
    expect(readCodexAuth(dir)).toBeNull();
  });

  it("defaults to the chatgpt.com backend-api wham URL", () => {
    expect(codexUsageUrl(dir)).toBe(
      "https://chatgpt.com/backend-api/wham/usage",
    );
  });

  it("honors config.toml chatgpt_base_url, switching path style off /backend-api", () => {
    writeFileSync(
      join(dir, "config.toml"),
      'chatgpt_base_url = "https://proxy.example.com/backend-api"\n',
    );
    expect(codexUsageUrl(dir)).toBe(
      "https://proxy.example.com/backend-api/wham/usage",
    );
    writeFileSync(
      join(dir, "config.toml"),
      'chatgpt_base_url = "https://api.example.com/"\n',
    );
    expect(codexUsageUrl(dir)).toBe("https://api.example.com/api/codex/usage");
  });
});

/** A scripted app-server child: records stdin lines, lets the test emit stdout lines and lifecycle. */
function fakeChild() {
  const written: string[] = [];
  let onData: ((d: string) => void) | null = null;
  let onClose: ((code: number | null) => void) | null = null;
  let onError: ((err: Error) => void) | null = null;
  let killed = false;
  const child: AppServerChild = {
    stdin: {
      write: (d: string) => {
        written.push(d);
      },
      end: () => {},
    },
    stdout: {
      setEncoding: () => {},
      on: (_ev, cb) => {
        onData = cb;
      },
    },
    on: (ev, cb) => {
      if (ev === "close") onClose = cb as (code: number | null) => void;
      if (ev === "error") onError = cb as (err: Error) => void;
    },
    kill: () => {
      killed = true;
      onClose?.(null);
    },
  };
  return {
    child,
    written,
    emit: (line: string) => onData?.(line + "\n"),
    error: (e: Error) => onError?.(e),
    wasKilled: () => killed,
  };
}

describe("fetchAppServerLimits", () => {
  it("drives initialize → initialized → account/rateLimits/read and parses the result", async () => {
    const f = fakeChild();
    const spawnFn: AppServerSpawn = () => f.child;
    const p = fetchAppServerLimits({ spawnFn, platform: "win32" });
    await Promise.resolve();
    const first = JSON.parse(f.written[0]) as { id: number; method: string };
    expect(first.method).toBe("initialize");
    f.emit(JSON.stringify({ id: first.id, result: {} }));
    await Promise.resolve();
    expect(
      f.written.some(
        (w) => (JSON.parse(w) as { method?: string }).method === "initialized",
      ),
    ).toBe(true);
    const readReq = f.written
      .map((w) => JSON.parse(w) as { id?: number; method?: string })
      .find((w) => w.method === "account/rateLimits/read");
    expect(readReq).toBeDefined();
    f.emit(
      JSON.stringify({
        id: readReq!.id,
        result: {
          rate_limits: {
            primary: {
              used_percent: 21,
              window_minutes: 300,
              resets_at: 1_800_000_000,
            },
          },
        },
      }),
    );
    const windows = await p;
    expect(windows?.fiveHour?.usedPct).toBe(21);
    expect(f.wasKilled()).toBe(true); // child terminated after the read
  });

  it("resolves null and kills the child on init timeout", async () => {
    vi.useFakeTimers();
    try {
      const f = fakeChild();
      const p = fetchAppServerLimits({
        spawnFn: () => f.child,
        platform: "win32",
      });
      await vi.advanceTimersByTimeAsync(8_001);
      expect(await p).toBeNull();
      expect(f.wasKilled()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves null on spawn error", async () => {
    const spawnFn: AppServerSpawn = () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    };
    expect(
      await fetchAppServerLimits({ spawnFn, platform: "win32" }),
    ).toBeNull();
  });

  it("resolves null when the child exits before answering", async () => {
    const f = fakeChild();
    const p = fetchAppServerLimits({
      spawnFn: () => f.child,
      platform: "win32",
    });
    await Promise.resolve();
    f.child.kill(); // triggers close
    expect(await p).toBeNull();
  });
});
