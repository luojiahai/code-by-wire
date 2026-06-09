import type { ModelId, PersistedSession } from './types'
import { equivApiValue } from './models'

/** One UTC-day bucket of the activity trend. The renderer formats the weekday label from `dayStartMs`. */
export interface DayBucket {
  /** Start of the UTC day (ms since epoch). */
  dayStartMs: number
  /** Sessions whose last activity fell on this UTC day. */
  sessions: number
  /** Summed Equivalent API value (USD) of those sessions. */
  equivApiValueUsd: number
}

/** Share of one model across the indexed sessions. */
export interface ModelMixEntry {
  model: ModelId
  sessions: number
  equivApiValueUsd: number
}

/** Per-project rollup across the indexed sessions. */
export interface ProjectRollup {
  project: string
  sessions: number
  equivApiValueUsd: number
}

/** The Overview's usage aggregates. Plain data — serializes straight over IPC (no Date objects). */
export interface Stats {
  /** 7 UTC-day buckets, oldest first, ending on `now`'s day. Always length 7. */
  weeklyActivity: DayBucket[]
  /** One entry per model present among indexed sessions, biggest Equivalent API value first. */
  modelMix: ModelMixEntry[]
  /** One entry per project, biggest Equivalent API value first. */
  projectRollup: ProjectRollup[]
}

const DAY_MS = 86_400_000
const TREND_DAYS = 7

/**
 * Start of the UTC day containing `ms`. Epoch is UTC-midnight-aligned and every UTC day is exactly
 * 86.4M ms (Unix time carries no leap seconds), so this is exact without a Date object — which also
 * makes it deterministic in tests no matter the runner's timezone.
 */
function startOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS
}

/**
 * Aggregate the indexed sessions into the Overview's stats: a 7-day activity trend, the model mix,
 * and a per-project rollup. Pure over the persisted snapshots (ADR-0002: SQLite is authoritative for
 * aggregates), so it never rescans a transcript. Equivalent API value is summed per session — each
 * session has one model, so `equivApiValue` is well-defined per row and the summation error stays far
 * below display precision (no cross-model double-counting).
 *
 * The trend buckets a session by the UTC day of its last activity, attributing the session's whole
 * token total to that day; the per-session index carries no finer timing. Days are UTC-aligned, not
 * the viewer's local midnight — a deliberate v1 simplification that keeps bucketing deterministic.
 * Model mix and project rollup span every indexed session (the recent + live window from ADR-0002),
 * so they read as "recent usage", matching the 7-day trend.
 */
export function computeStats(sessions: PersistedSession[], now: number): Stats {
  // Pre-seed 7 empty day buckets, oldest first, so the trend always renders a full week frame.
  const today = startOfUtcDay(now)
  const weeklyActivity: DayBucket[] = []
  const bucketByDay = new Map<number, DayBucket>()
  for (let k = TREND_DAYS - 1; k >= 0; k--) {
    const bucket: DayBucket = { dayStartMs: today - k * DAY_MS, sessions: 0, equivApiValueUsd: 0 }
    weeklyActivity.push(bucket)
    bucketByDay.set(bucket.dayStartMs, bucket)
  }

  const byModel = new Map<ModelId, Tally>()
  const byProject = new Map<string, Tally>()

  for (const s of sessions) {
    const value = equivApiValue(s.usage, s.model)

    // Activity trend — only sessions whose last-activity day is one of the 7 buckets.
    const bucket = bucketByDay.get(startOfUtcDay(s.lastActivityMs))
    if (bucket) {
      bucket.sessions += 1
      bucket.equivApiValueUsd += value
    }

    // Model mix and project rollup — every indexed session, same add-or-create fold.
    addToGroup(byModel, s.model, value)
    addToGroup(byProject, s.project, value)
  }

  return {
    weeklyActivity,
    modelMix: [...byModel]
      .map(([model, t]) => ({ model, ...t }))
      .sort(byValueDesc((e) => e.equivApiValueUsd, (e) => e.model)),
    projectRollup: [...byProject]
      .map(([project, t]) => ({ project, ...t }))
      .sort(byValueDesc((e) => e.equivApiValueUsd, (e) => e.project)),
  }
}

/** A running session count and summed Equivalent API value for one group key (model or project). */
interface Tally {
  sessions: number
  equivApiValueUsd: number
}

/** Fold one session into a keyed group: bump its count and value, creating the tally on first sight. */
function addToGroup<K>(groups: Map<K, Tally>, key: K, value: number): void {
  let tally = groups.get(key)
  if (!tally) {
    tally = { sessions: 0, equivApiValueUsd: 0 }
    groups.set(key, tally)
  }
  tally.sessions += 1
  tally.equivApiValueUsd += value
}

/** Sort by a numeric value descending, breaking ties on a string key ascending so the order is
 *  deterministic — tests and the UI never see two equal-value rows flip. */
function byValueDesc<T>(value: (t: T) => number, tie: (t: T) => string) {
  return (a: T, b: T): number => value(b) - value(a) || tie(a).localeCompare(tie(b))
}
