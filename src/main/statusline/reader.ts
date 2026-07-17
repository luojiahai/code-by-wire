import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RateLimit } from "@shared/types";
import type { StatusLineReader, StatusLineSample } from "@shared/statusline";
import { CAPTURE_STALE_MS } from "@shared/statusline";
import { usageBreakdown } from "../provider/claude/transcript-row";
import { resolveClaudeDir } from "../claude-config";

export interface StatusLineReaderDeps {
  /** Claude config dir; defaults via resolveClaudeDir. Tests inject a temp dir. */
  claudeDir?: string;
  /** Wall clock (ms) the prune cutoff is measured against; injected so tests are deterministic. */
  now?: () => number;
}

/** Where the wrapper writes one JSON capture per Session (`<sessionId>.json`). */
function statusLineDir(claudeDir: string): string {
  return join(claudeDir, ".flightdeck", "statusline");
}

/** A finite number, or null — the trust-boundary coercion for every numeric field. Accepts a
 *  non-empty numeric STRING too (ccstatusline's CoercedNumberSchema exists because some CLI builds
 *  emitted numeric strings — A2): "85" → 85; ""/"x"/Infinity → null. */
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** One window of the raw `rate_limits` block → RateLimit, converting resets_at (epoch s) to epoch ms.
 *  Returns undefined when the window is absent or malformed (windows degrade independently). */
function parseWindow(raw: unknown): RateLimit | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const usedPct = num(r.used_percentage);
  const resetsAtSec = num(r.resets_at);
  if (usedPct === null || resetsAtSec === null) return undefined;
  return { usedPct, resetsAt: resetsAtSec * 1000 };
}

/** Parse one statusLine JSON blob into a sample. Defensive: a missing/mistyped field degrades to null,
 *  never throws. Returns null only when there's no usable session id to key the capture by. */
function parseSample(
  raw: string,
  capturedMtimeMs: number,
): StatusLineSample | null {
  let j: Record<string, unknown>;
  try {
    const v = JSON.parse(raw);
    if (v === null || typeof v !== "object") return null;
    j = v as Record<string, unknown>;
  } catch {
    return null;
  }
  const sessionId = typeof j.session_id === "string" ? j.session_id : null;
  if (!sessionId) return null;

  const cost = (j.cost ?? {}) as Record<string, unknown>;
  const ctx = (j.context_window ?? {}) as Record<string, unknown>;
  const model = (j.model ?? {}) as Record<string, unknown>;
  const effort = (j.effort ?? {}) as Record<string, unknown>;
  const workspace = (j.workspace ?? {}) as Record<string, unknown>;
  const rl = j.rate_limits;
  let rateLimits: StatusLineSample["rateLimits"] = null;
  if (rl !== null && typeof rl === "object") {
    const r = rl as Record<string, unknown>;
    rateLimits = {
      fiveHour: parseWindow(r.five_hour),
      sevenDay: parseWindow(r.seven_day),
      sevenDaySonnet: parseWindow(r.seven_day_sonnet),
      sevenDayOpus: parseWindow(r.seven_day_opus),
    };
  }

  const prRaw = j.pr;
  let pr: StatusLineSample["pr"] = null;
  if (prRaw !== null && typeof prRaw === "object") {
    const p = prRaw as Record<string, unknown>;
    const prNumber = num(p.number);
    const prUrl = typeof p.url === "string" && p.url.length > 0 ? p.url : null;
    if (prNumber !== null && prUrl !== null) {
      pr = {
        number: prNumber,
        url: prUrl,
        reviewState:
          typeof p.review_state === "string" && p.review_state.length > 0
            ? p.review_state
            : null,
      };
    }
  }

  const pct = num(ctx.used_percentage);
  const sessionName =
    typeof j.session_name === "string" && j.session_name.length > 0
      ? j.session_name
      : null;
  const cwd =
    typeof j.cwd === "string" && j.cwd.length > 0
      ? j.cwd
      : typeof workspace.current_dir === "string" &&
          workspace.current_dir.length > 0
        ? workspace.current_dir
        : null;
  return {
    sessionId,
    capturedMtimeMs,
    costUsd: num(cost.total_cost_usd),
    linesAdded: num(cost.total_lines_added),
    linesRemoved: num(cost.total_lines_removed),
    contextPct:
      pct === null ? null : Math.min(100, Math.max(0, Math.round(pct))),
    contextWindow: num(ctx.context_window_size),
    liveContext: usageBreakdown(ctx.current_usage),
    modelId: typeof model.id === "string" ? model.id : null,
    modelDisplayName:
      typeof model.display_name === "string" ? model.display_name : null,
    sessionName,
    version:
      typeof j.version === "string" && j.version.length > 0 ? j.version : null,
    effortLevel:
      typeof effort.level === "string" && effort.level.length > 0
        ? effort.level
        : null,
    cwd,
    sessionClockMs: num(cost.total_duration_ms),
    apiDurationMs: num(cost.total_api_duration_ms),
    pr,
    rateLimits,
  };
}

/**
 * Reads the per-Session statusLine captures the wrapper writes. Read-on-demand — one cheap dir scan
 * plus small JSON reads per Overview pass, mirroring how the Observed view polls. No fs.watch, no
 * daemon: the app is windowed-only and the 3s Overview refresh is the merge cadence. An absent dir
 * (nothing installed yet, or no captures) reads as "no live data": an empty list, never an error.
 * A capture older than CAPTURE_STALE_MS belongs to a session long gone from the index; it's pruned on
 * sight so the dir can't grow without bound and the hot read path never re-parses dead data.
 */
export function createStatusLineReader(
  deps: StatusLineReaderDeps = {},
): StatusLineReader {
  const dir = statusLineDir(resolveClaudeDir(deps.claudeDir));
  const now = deps.now ?? ((): number => Date.now());
  return {
    read(): StatusLineSample[] {
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch (err) {
        // An absent dir (nothing installed / no captures yet) is the normal "no live data" case. A real
        // read failure (EACCES/EIO) isn't that, and shouldn't masquerade as it silently — surface it.
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`statusLine reader: cannot read ${dir}`, err);
        }
        return [];
      }
      const out: StatusLineSample[] = [];
      const cutoff = now() - CAPTURE_STALE_MS;
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        const path = join(dir, name);
        try {
          const mtimeMs = statSync(path).mtimeMs;
          if (mtimeMs < cutoff) {
            rmSync(path, { force: true }); // stale: drop it instead of re-reading and re-parsing it
            continue;
          }
          const sample = parseSample(readFileSync(path, "utf8"), mtimeMs);
          if (sample) out.push(sample);
        } catch {
          // a file that vanished mid-scan or won't read — skip it, never sink the pass
        }
      }
      return out;
    },
  };
}
