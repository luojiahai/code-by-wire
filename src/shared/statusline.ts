import type {
  Account,
  ExtraUsage,
  RateLimit,
  RateLimitWindows,
  Session,
  SessionPr,
} from "./types";
import type { ContextBreakdown } from "./transcript";
import { contextTotal } from "./context";
import { parseContextWindowSize } from "./models";

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
  /** Cumulative time an API request was in flight (stdin cost.total_api_duration_ms) — the Duty
   *  panel's numerator over sessionClockMs. null when omitted. */
  apiDurationMs: number | null;
  /** The capture's `pr` block, or null when absent or malformed (no usable number + url). */
  pr: SessionPr | null;
  /** Account rate limits, present when the capture carries them (a subscription that has had its first
   *  API response). null when absent: a subscription before that response, or a session whose billing the
   *  app can't determine. Each window may be independently absent. The two weekly sub-buckets join the
   *  existing five_hour / seven_day windows. */
  rateLimits: RateLimitWindows | null;
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

/** A rate-limit window only if its reset is still ahead. A window that has already reset can't be
 *  described by a past capture, so it's dropped rather than shown with a stale "% used · resets now". */
function liveWindow(
  w: RateLimit | undefined,
  now: number,
): RateLimit | undefined {
  return w && w.resetsAt > now ? w : undefined;
}

/** The usage API's account-wide answer: the four windows plus extra-usage credits. The fill side of
 *  the per-session merge — the panel never renders it without first consulting the selected session. */
export interface AccountUsage extends RateLimitWindows {
  extraUsage?: ExtraUsage;
}

/** ccstatusline's mergeUsageData, per window: the selected session's own capture window wins, the
 *  API-fetched window fills an absent (or expired) one, both absent → undefined (a dashed row).
 *  Granularity note (audit): ccs merges per FIELD; ours is per window because RateLimit requires both
 *  fields and parseWindow discards half-formed capture windows — documented micro-deviation. */
export function pickWindow(
  session: RateLimit | undefined,
  api: RateLimit | undefined,
  now: number,
): RateLimit | undefined {
  return liveWindow(session, now) ?? liveWindow(api, now);
}

/**
 * The app-wide Account. Windows are a pass-through of the usage-API fetch (each through the
 * liveWindow guard so a reset elapsing inside the TTL drops rather than shows stale); they exist
 * solely as the per-session merge's fill side — the panel never renders them without first
 * consulting the selected session (see pickWindow). Captures are consulted only as evidence:
 *
 * - subscription: an OAuth usage response is direct proof, OR any fresh capture carries rate_limits
 *   (even all-expired — the history is proof, so a dormant subscriber is never relabeled).
 * - api: no evidence, but at least one fresh sample exists.
 *
 * Returns null when there's no API usage and no recent statusLine data at all.
 */
export function deriveAccount(
  samples: Iterable<StatusLineSample>,
  now: number,
  staleMs: number,
  apiUsage?: AccountUsage | null,
): Account | null {
  let freshest: StatusLineSample | null = null;
  let sawRateLimits = false;
  for (const s of samples) {
    if (now - s.capturedMtimeMs > staleMs) continue;
    if (!freshest || s.capturedMtimeMs > freshest.capturedMtimeMs) freshest = s;
    if (s.rateLimits) sawRateLimits = true;
  }
  if (apiUsage || sawRateLimits) {
    const acc: Account = {
      billingMode: "subscription",
      fiveHour: liveWindow(apiUsage?.fiveHour, now),
      sevenDay: liveWindow(apiUsage?.sevenDay, now),
      sevenDaySonnet: liveWindow(apiUsage?.sevenDaySonnet, now),
      sevenDayOpus: liveWindow(apiUsage?.sevenDayOpus, now),
    };
    if (apiUsage?.extraUsage) acc.extraUsage = apiUsage.extraUsage;
    if (freshest?.version) acc.version = freshest.version;
    return acc;
  }
  if (freshest) {
    const acc: Account = { billingMode: "api" };
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
    const window =
      sample.contextWindow ??
      parseContextWindowSize(sample.modelId, sample.modelDisplayName) ??
      s.contextWindow;
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
      effortLevel: sample.effortLevel ?? s.effortLevel,
      sessionClockMs: sample.sessionClockMs ?? s.sessionClockMs,
      cwd: sample.cwd ?? s.cwd,
      costUsd: sample.costUsd ?? undefined,
      apiDurationMs: sample.apiDurationMs ?? undefined,
      pr: sample.pr ?? undefined,
      rateLimits: sample.rateLimits ?? undefined,
    };
  });
}
