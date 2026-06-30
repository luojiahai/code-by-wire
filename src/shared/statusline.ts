import type { Account, ApiConfig, RateLimit, Session } from "./types";
import type { ContextBreakdown } from "./transcript";
import { contextTotal } from "./context";

/** One normalized statusLine capture for a Session, parsed from a side-channel file. Plain data so it
 *  crosses IPC cleanly. `null` fields are "the statusLine didn't report this", distinct from 0. */
export interface StatusLineSample {
  sessionId: string;
  /** File mtime (ms) of the capture — its freshness, used to pick the account snapshot. */
  capturedMtimeMs: number;
  costUsd: number | null;
  linesAdded: number | null;
  linesRemoved: number | null;
  /** Live context fill 0–100 (statusLine used_percentage), or null when the statusLine omitted it. */
  contextPct: number | null;
  /** Live context window size (tokens), or null when omitted. */
  contextWindow: number | null;
  /** The capture's current-context split (current_usage): input + cache-read + cache-creation, the
   *  live equivalent of the transcript's per-turn breakdown. null when omitted or zero-sum. */
  liveContext: ContextBreakdown | null;
  /** The raw model identifier the statusLine reports (e.g. 'claude-opus-4-8[1m]'). null when omitted. */
  modelId: string | null;
  /** Claude's own model label (model.display_name). null when omitted. */
  modelDisplayName: string | null;
  /** A deliberately-named session (`--name` / `/rename`), or null when unnamed. */
  sessionName: string | null;
  /** Claude Code CLI version (stdin `version`), e.g. "2.0.14". null when omitted. */
  version: string | null;
  /** Thinking effort level (stdin `effort.level`): 'low' | 'medium' | 'high' | 'xhigh' | 'max'. null when omitted. */
  effortLevel: string | null;
  /** Working directory (stdin `cwd`, else `workspace.current_dir`). null when omitted. */
  cwd: string | null;
  /** Elapsed session wall-clock in ms (stdin `cost.total_duration_ms`). null when omitted. */
  sessionClockMs: number | null;
  /** Account rate limits, present when the capture carries them (a subscription that has had its first
   *  API response). null when absent: a subscription before that response, or a session whose billing the
   *  app can't determine. Each window may be independently absent. The two weekly sub-buckets join the
   *  existing five_hour / seven_day windows. */
  rateLimits: {
    fiveHour?: RateLimit;
    sevenDay?: RateLimit;
    sevenDaySonnet?: RateLimit;
    sevenDayOpus?: RateLimit;
  } | null;
}

/** The seam ipc.ts depends on: the live captures the wrapper writes. Implemented in main by a file reader. */
export interface StatusLineReader {
  /** All current captures, one (freshest) per file. */
  read(): StatusLineSample[];
}

/** A capture older than this can't describe a current 5-hour or 7-day window, and its session is long
 *  gone from the index — so it's both ignored when deriving the account and pruned from disk on read. */
export const CAPTURE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** Freshest sample per Session id — a session that wrote several captures keeps only its newest. */
export function freshestBySession(
  samples: StatusLineSample[],
): Map<string, StatusLineSample> {
  const byId = new Map<string, StatusLineSample>();
  for (const s of samples) {
    const prev = byId.get(s.sessionId);
    if (!prev || s.capturedMtimeMs > prev.capturedMtimeMs)
      byId.set(s.sessionId, s);
  }
  return byId;
}

/** True when `url`'s host is anthropic.com or a *.anthropic.com subdomain. Scheme-tolerant (the synthesized
 *  default carries one; a hand-set ANTHROPIC_BASE_URL may not) and spoof-safe — the leading-dot match
 *  rejects lookalikes like evil-anthropic.com. Undefined (a cloud provider, no endpoint) is not direct. */
function isAnthropicHost(url: string | undefined): boolean {
  if (!url) return false;
  const host = url
    .replace(/^https?:\/\//i, "")
    .split(/[/:?#]/)[0]
    .toLowerCase();
  return host === "anthropic.com" || host.endsWith(".anthropic.com");
}

/** A rate-limit window only if its reset is still ahead. A window that has already reset can't be
 *  described by a past capture, so it's dropped rather than shown with a stale "% used · resets now". */
function liveWindow(
  w: RateLimit | undefined,
  now: number,
): RateLimit | undefined {
  return w && w.resetsAt > now ? w : undefined;
}

/**
 * The app-wide Account from the live statusLine captures within `staleMs` of `now`, plus the configured
 * `apiConfig` (read from settings.json by the main process). Billing mode is decided here, in one place:
 *
 * - subscription: rate-limit presence is the signal. A capture carrying rate_limits is a
 *   subscription; the account takes its windows from the freshest capture that HAS them. To avoid flapping
 *   (a subscription session before its first API response, or an API-key session running alongside, carries
 *   no rate_limits) a newer no-limits capture can't override an older with-limits one. Each window is dropped
 *   once its reset has passed, so a stale capture can't show an expired limit as current.
 * - unknown: no live window AND no API endpoint to surface. Reached when every window has expired (a
 *   dormant subscriber — still a subscriber, just idle), or when no capture carries rate_limits and no base
 *   URL is configured. The block disappears rather than show a window-less 'subscription'.
 * - api: when no capture ever carried rate_limits (no subscription evidence) and `apiConfig` is present —
 *   a base URL (configured or the synthesized direct default) or a cloud provider. `anthropicDirect` is set
 *   when the host is anthropic.com with no upstream provider. A capture with rate_limits — even all-expired —
 *   is proof of a subscription, so a dormant subscriber is NEVER relabeled API billing.
 *
 * Returns null when there's no recent statusLine data at all (the UI reads null as "no bars").
 */
export function deriveAccount(
  samples: Iterable<StatusLineSample>,
  now: number,
  staleMs: number,
  apiConfig: ApiConfig | null = null,
): Account | null {
  let freshest: StatusLineSample | null = null;
  let withLimits: StatusLineSample | null = null;
  for (const s of samples) {
    if (now - s.capturedMtimeMs > staleMs) continue;
    if (!freshest || s.capturedMtimeMs > freshest.capturedMtimeMs) freshest = s;
    if (
      s.rateLimits &&
      (!withLimits || s.capturedMtimeMs > withLimits.capturedMtimeMs)
    )
      withLimits = s;
  }
  if (withLimits?.rateLimits) {
    const fiveHour = liveWindow(withLimits.rateLimits.fiveHour, now);
    const sevenDay = liveWindow(withLimits.rateLimits.sevenDay, now);
    const sevenDaySonnet = liveWindow(
      withLimits.rateLimits.sevenDaySonnet,
      now,
    );
    const sevenDayOpus = liveWindow(withLimits.rateLimits.sevenDayOpus, now);
    // A still-live window is the only proof of a *current* subscription. Once every window has passed its
    // reset, fall through — but `withLimits` stays set, so the api branch below knows this is a dormant
    // subscriber and won't relabel it API billing.
    if (fiveHour || sevenDay || sevenDaySonnet || sevenDayOpus) {
      const acc: Account = {
        billingMode: "subscription",
        fiveHour,
        sevenDay,
        sevenDaySonnet,
        sevenDayOpus,
      };
      if (freshest?.version) acc.version = freshest.version;
      return acc;
    }
  }
  if (freshest) {
    // Promote to api only when there's no subscription evidence at all (`withLimits` null — no capture ever
    // carried rate_limits) and an endpoint is configured. A dormant subscriber (withLimits set, all expired)
    // falls to 'unknown' instead, so its cost never mislabels as 'Actual API spend'.
    let acc: Account;
    if (!withLimits && apiConfig) {
      acc = { billingMode: "api" };
      if (apiConfig.baseUrl) acc.apiBaseUrl = apiConfig.baseUrl;
      if (apiConfig.authMethod) acc.apiAuthMethod = apiConfig.authMethod;
      if (apiConfig.provider) acc.apiProvider = apiConfig.provider;
      // Real-spend framing is a strong claim, so assert direct billing only when a credential was actually
      // detected — a bare anthropic.com base URL with no auth env stays an estimate (keeps the ~).
      if (
        isAnthropicHost(apiConfig.baseUrl) &&
        apiConfig.authMethod &&
        !apiConfig.provider
      )
        acc.anthropicDirect = true;
    } else {
      acc = { billingMode: "unknown" };
    }
    if (freshest.version) acc.version = freshest.version;
    return acc;
  }
  return null;
}

/**
 * Overlay live statusLine numbers onto each Session that has a sample: cost, lines, context split,
 * context %/window, model identity, and the title (a deliberately-named session_name wins over the
 * transcript-derived title). A Session with no sample passes through untouched, still showing its
 * transcript-computed values (graceful degradation). A sample that omitted a field falls back
 * to the Session's computed value for that field.
 */
export function overlaySessions(
  sessions: Session[],
  byId: Map<string, StatusLineSample>,
): Session[] {
  return sessions.map((s) => {
    const sample = byId.get(s.id);
    if (!sample) return s;
    const window = sample.contextWindow ?? s.contextWindow;
    // When the capture carries a live split but no used_percentage, fill from those exact tokens over
    // the window rather than the stale transcript %. The Context panel shows the live split's total/window
    // beside this %, so a transcript number there would visibly contradict the tokens next to it.
    const liveDerivedPct =
      sample.contextPct == null && sample.liveContext && window > 0
        ? Math.min(
            100,
            Math.round((contextTotal(sample.liveContext) / window) * 100),
          )
        : null;
    return {
      ...s,
      title: sample.sessionName ?? s.title,
      contextPct: sample.contextPct ?? liveDerivedPct ?? s.contextPct,
      contextWindow: window,
      liveContext: sample.liveContext,
      modelId: sample.modelId ?? undefined,
      modelDisplayName: sample.modelDisplayName ?? undefined,
      linesAdded: sample.linesAdded ?? undefined,
      linesRemoved: sample.linesRemoved ?? undefined,
      effortLevel: sample.effortLevel ?? undefined,
      sessionClockMs: sample.sessionClockMs ?? undefined,
      cwd: sample.cwd ?? undefined,
    };
  });
}
