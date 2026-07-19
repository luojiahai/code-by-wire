import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RateLimit, RateLimitWindows } from "@shared/types";
import { toSpawnForm } from "../../terminal/command";
import { isExecutableFile, findOnPath } from "../../terminal/shell-command";
import { createTtlFetch, type TtlFetch } from "../../util/ttl-fetch";
import { asRecord } from "./rollout";

/** First present-and-non-null value among the given keys — the snake/camel tolerance helper. */
const pick = (
  r: Record<string, unknown> | null,
  ...keys: string[]
): unknown => {
  for (const k of keys) {
    const v = r?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

/** Numbers may arrive as JSON numbers or numeric strings (both observed across codex versions). */
const asNum = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
    return Number(v);
  return null;
};

/** Epoch normalize: values below ~2001-09-09 in ms are epoch SECONDS (codex's resets_at). */
const toEpochMs = (v: number): number => (v > 1_000_000_000_000 ? v : v * 1000);

interface ClassifiedWindow extends RateLimit {
  windowMinutes: number | null;
}

/** One window record → {usedPct, resetsAt, windowMinutes}, or null when half-formed (RateLimit
 *  requires both fields — same discard rule as the claude statusline parser). */
function windowFromRecord(
  r: Record<string, unknown> | null,
  nowMs: number,
): ClassifiedWindow | null {
  if (!r) return null;
  const usedPct = asNum(pick(r, "used_percent", "usedPercent"));
  if (usedPct === null) return null;
  const resetAt = asNum(pick(r, "reset_at", "resets_at", "resetsAt"));
  const resetAfterS = asNum(
    pick(r, "reset_after_seconds", "resets_in_seconds", "resetsInSeconds"),
  );
  const resetsAt =
    resetAt !== null
      ? toEpochMs(resetAt)
      : resetAfterS !== null
        ? nowMs + resetAfterS * 1000
        : null;
  if (resetsAt === null) return null;
  const windowSeconds = asNum(
    pick(r, "limit_window_seconds", "limitWindowSeconds"),
  );
  const windowMinutes =
    asNum(pick(r, "window_minutes", "windowMinutes", "windowDurationMins")) ??
    (windowSeconds !== null ? windowSeconds / 60 : null);
  return { usedPct, resetsAt, windowMinutes };
}

/** Classify by window length — 300 min → fiveHour, 10080 → sevenDay — with a positional fallback
 *  for unrecognized lengths (or a length collision between primary and secondary) so a window is
 *  never dropped. The fallback preserves each surviving window's own origin (primary's preference
 *  is fiveHour, secondary's is sevenDay) rather than assigning by iteration order, so a lone
 *  surviving secondary window (its sibling discarded as malformed) can't usurp the fiveHour slot,
 *  and two same-length windows (a length collision) both still land somewhere rather than one
 *  being silently dropped. */
function classifyWindows(
  primary: ClassifiedWindow | null,
  secondary: ClassifiedWindow | null,
): RateLimitWindows | null {
  if (!primary && !secondary) return null;
  const out: RateLimitWindows = {};
  const strip = ({ usedPct, resetsAt }: ClassifiedWindow): RateLimit => ({
    usedPct,
    resetsAt,
  });
  // Length match first (order-independent — handles the API swapping primary/secondary). Whichever
  // window doesn't land here (unrecognized length, OR its slot was already taken by a same-length
  // sibling) carries its origin tag into the fallback below.
  const remaining: Array<{ w: ClassifiedWindow; isPrimary: boolean }> = [];
  for (const [w, isPrimary] of [
    [primary, true],
    [secondary, false],
  ] as const) {
    if (!w) continue;
    if (w.windowMinutes === 300 && !out.fiveHour) out.fiveHour = strip(w);
    else if (w.windowMinutes === 10_080 && !out.sevenDay)
      out.sevenDay = strip(w);
    else remaining.push({ w, isPrimary });
  }
  // Positional fallback, by each window's own origin — never gated on windowMinutes, so a window
  // reaching this loop is placed unconditionally (into its preferred slot, or the other one).
  for (const { w, isPrimary } of remaining) {
    if (isPrimary) {
      if (!out.fiveHour) out.fiveHour = strip(w);
      else if (!out.sevenDay) out.sevenDay = strip(w);
    } else {
      if (!out.sevenDay) out.sevenDay = strip(w);
      else if (!out.fiveHour) out.fiveHour = strip(w);
    }
  }
  return out;
}

/** Decode the wham/usage HTTP payload. Lossy by design: each window decodes independently, one
 *  malformed sibling never discards the rest; anything unusable → null. */
export function parseWhamUsage(
  body: unknown,
  nowMs: number,
): RateLimitWindows | null {
  const root = asRecord(body);
  const rl = asRecord(pick(root, "rate_limit", "rateLimit"));
  if (!rl) return null;
  return classifyWindows(
    windowFromRecord(
      asRecord(pick(rl, "primary_window", "primaryWindow", "primary")),
      nowMs,
    ),
    windowFromRecord(
      asRecord(pick(rl, "secondary_window", "secondaryWindow", "secondary")),
      nowMs,
    ),
  );
}

/** Decode the app-server account/rateLimits/read result (snake or camel; flat or by-limit-id). */
export function parseAppServerRateLimits(
  result: unknown,
  nowMs: number,
): RateLimitWindows | null {
  const root = asRecord(result);
  if (!root) return null;
  const readEnvelope = (
    env: Record<string, unknown> | null,
  ): RateLimitWindows | null =>
    env
      ? classifyWindows(
          windowFromRecord(asRecord(pick(env, "primary")), nowMs),
          windowFromRecord(asRecord(pick(env, "secondary")), nowMs),
        )
      : null;
  const direct = readEnvelope(
    asRecord(pick(root, "rate_limits", "rateLimits")),
  );
  if (direct) return direct;
  const byId = asRecord(
    pick(root, "rate_limits_by_limit_id", "rateLimitsByLimitId"),
  );
  if (byId) {
    const entry = asRecord(byId.codex) ?? asRecord(Object.values(byId)[0]);
    const fromEntry = readEnvelope(entry);
    if (fromEntry) return fromEntry;
  }
  return null;
}

export interface CodexAuth {
  accessToken: string;
  accountId: string | null;
}

/** READ-ONLY view of $CODEX_HOME/auth.json (spec decision #4: never write, never refresh). Null for
 *  absent/malformed files and API-key-only auth (the wham endpoint is ChatGPT-plan) — the caller
 *  falls through to the app-server, which handles its own auth. Creds moved into the OS keyring by
 *  codex's cli_auth_credentials_store also land here as null. */
export function readCodexAuth(codexDir: string): CodexAuth | null {
  let parsed: Record<string, unknown> | null;
  try {
    parsed = asRecord(
      JSON.parse(readFileSync(join(codexDir, "auth.json"), "utf8")),
    );
  } catch {
    return null;
  }
  const tokens = asRecord(parsed?.tokens);
  const access = pick(tokens, "access_token", "accessToken");
  if (typeof access !== "string" || !access) return null;
  const account = pick(tokens, "account_id", "accountId");
  return {
    accessToken: access,
    accountId: typeof account === "string" && account ? account : null,
  };
}

const DEFAULT_USAGE_BASE = "https://chatgpt.com/backend-api";

/** The usage endpoint, honoring config.toml's chatgpt_base_url (a one-line regex read — no TOML
 *  dependency for one optional key). CodexBar's rule: a base carrying /backend-api uses the wham
 *  path; any other base uses the /api/codex/usage style. */
export function codexUsageUrl(codexDir: string): string {
  let base = DEFAULT_USAGE_BASE;
  try {
    const toml = readFileSync(join(codexDir, "config.toml"), "utf8");
    const m = /^\s*chatgpt_base_url\s*=\s*["']([^"']+)["']/m.exec(toml);
    if (m) base = m[1].replace(/\/+$/, "");
  } catch {
    // no config.toml → default base
  }
  return base.includes("/backend-api")
    ? `${base}/wham/usage`
    : `${base}/api/codex/usage`;
}

export const APP_SERVER_INIT_TIMEOUT_MS = 8_000;
export const APP_SERVER_REQUEST_TIMEOUT_MS = 3_000;

/** The narrow child surface fetchAppServerLimits drives — ProbeChild (cli-check.ts) plus stdin.
 *  Method syntax so both the real ChildProcess and a loose test fake satisfy it. */
export interface AppServerChild {
  stdin: { write(data: string): void; end(): void } | null;
  stdout: {
    setEncoding(enc: string): void;
    on(ev: "data", cb: (d: string) => void): void;
  } | null;
  on(ev: "error", cb: (err: Error) => void): void;
  on(ev: "close", cb: (code: number | null) => void): void;
  kill(): boolean | void;
}

export type AppServerSpawn = (
  file: string,
  args: string[],
  opts: { detached: boolean; stdio: ["pipe", "pipe", "ignore"] },
) => AppServerChild;

const realAppServerSpawn: AppServerSpawn = (file, args, opts) =>
  spawn(file, args, opts);

const APP_SERVER_ARGS = ["-s", "read-only", "-a", "untrusted", "app-server"];

/**
 * The rate-limit fallback: spawn `codex app-server` (read-only, untrusted sandbox), speak
 * newline-delimited JSON-RPC — initialize, initialized, account/rateLimits/read — then terminate
 * the child. Spawned through the same toSpawnForm the CLI probes use (login-shell wrap on POSIX,
 * PATHEXT shim on win32) so "codex" resolves exactly like a Managed spawn would; detached on POSIX
 * for the same foreground-group defense as createProbeExec. Resolves null on ANY failure — missing
 * binary, timeout, malformed response — and never rejects; the caller's TTL backoff owns retry pacing.
 */
export function fetchAppServerLimits(deps: {
  spawnFn?: AppServerSpawn;
  platform?: NodeJS.Platform;
  now?: () => number;
}): Promise<RateLimitWindows | null> {
  const spawnFn = deps.spawnFn ?? realAppServerSpawn;
  const platform = deps.platform ?? process.platform;
  const now = deps.now ?? ((): number => Date.now());
  return new Promise((resolve) => {
    let child: AppServerChild;
    try {
      const { file, args } = toSpawnForm(
        { file: "codex", args: APP_SERVER_ARGS },
        platform,
        platform === "win32"
          ? undefined
          : {
              env: process.env,
              isExecutable: isExecutableFile,
              findOnPath: (name) => findOnPath(name, process.env),
            },
      );
      child = spawnFn(file, args, {
        detached: platform !== "win32",
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch {
      resolve(null);
      return;
    }
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    const settle = (value: RateLimitWindows | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        child.kill();
      } catch {
        // already dead
      }
      resolve(value);
    };
    const arm = (ms: number): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => settle(null), ms);
    };
    const send = (msg: Record<string, unknown>): void => {
      try {
        child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
      } catch {
        settle(null);
      }
    };

    const INIT_ID = 1;
    const READ_ID = 2;
    let buffer = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (d: string) => {
      buffer += d;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let row: Record<string, unknown> | null;
        try {
          row = asRecord(JSON.parse(line));
        } catch {
          continue; // non-JSON chatter on stdout
        }
        if (!row) continue;
        if (row.id === INIT_ID) {
          send({ method: "initialized" });
          send({ id: READ_ID, method: "account/rateLimits/read" });
          arm(APP_SERVER_REQUEST_TIMEOUT_MS);
        } else if (row.id === READ_ID) {
          settle(parseAppServerRateLimits(row.result, now()));
        }
      }
    });
    child.on("error", () => settle(null));
    child.on("close", () => settle(null));

    arm(APP_SERVER_INIT_TIMEOUT_MS);
    send({
      id: INIT_ID,
      method: "initialize",
      params: {
        clientInfo: {
          name: "code-by-wire",
          title: "code by wire",
          version: "0",
        },
      },
    });
  });
}

export const CODEX_LIMITS_TTL_MS = 60_000;
export const CODEX_LIMITS_FAILURE_TTL_MS = 300_000;
export const CODEX_LIMITS_TIMEOUT_MS = 5_000;

export type CodexLimitsService = TtlFetch<RateLimitWindows>;

export interface CodexLimitsDeps {
  codexDir: string;
  /** Narrow fetch surface, same shape as usage/fetch.ts — net.fetch in prod, a stub in tests. */
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  spawnFn?: AppServerSpawn;
  platform?: NodeJS.Platform;
  now?: () => number;
}

/** The OAuth (primary) leg: bearer + account id from auth.json against the wham/usage endpoint.
 *  Null on any failure — the chain then tries the app-server. */
async function fetchOAuthLimits(
  deps: CodexLimitsDeps,
): Promise<RateLimitWindows | null> {
  const nowMs = (deps.now ?? Date.now)();
  const auth = readCodexAuth(deps.codexDir);
  if (!auth) return null;
  let res: Response;
  try {
    res = await deps.fetchFn(codexUsageUrl(deps.codexDir), {
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        Accept: "application/json",
        ...(auth.accountId ? { "ChatGPT-Account-Id": auth.accountId } : {}),
      },
      signal: AbortSignal.timeout(CODEX_LIMITS_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  return parseWhamUsage(body, nowMs);
}

/**
 * Account-scoped codex rate limits behind the shared ttl-fetch: OAuth first (CodexBar's primary
 * path), `codex app-server` fallback. read() is sync and lazy — refreshes ride renderer polls,
 * success 60s / failure 5min so a broken path never hammers the network or respawns processes
 * every tick (spec §limits.ts).
 */
export function createCodexLimitsService(
  deps: CodexLimitsDeps,
): CodexLimitsService {
  return createTtlFetch<RateLimitWindows>({
    fetch: async () =>
      (await fetchOAuthLimits(deps)) ?? (await fetchAppServerLimits(deps)),
    successTtlMs: CODEX_LIMITS_TTL_MS,
    failureTtlMs: CODEX_LIMITS_FAILURE_TTL_MS,
    now: deps.now,
  });
}
