import { statSync } from 'node:fs'
import type { Provider } from '../types'
import type { Management } from '@shared/types'
import { readTextOrNull, resolveClaudeDir } from '../../claude-config'
import { indexTranscripts, listCandidates, summarize, restate } from './discover'
import { parseTranscriptEvents } from './transcript-events'

export interface ClaudeProviderDeps {
  claudeDir?: string
  isPidAlive?: (pid: number) => boolean
  /** Clock for the recency cut; defaults to the wall clock, overridden in tests. */
  now?: () => number
  /** How recent (ms) an Ended session's transcript must be to surface; defaults to 7 days. */
  recentWindowMs?: number
  /** The authority for Managed-ness: a discovered session is Managed iff this run spawned its id.
   *  Defaults to "nothing is Managed", so a provider built without it labels everything Observed. */
  managed?: { has(id: string): boolean }
}

const DEFAULT_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** A pid is alive if signalling it succeeds, or fails only because we lack permission. */
function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'EPERM'
  }
}

export function createClaudeProvider(deps: ClaudeProviderDeps = {}): Provider {
  const claudeDir = resolveClaudeDir(deps.claudeDir)
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive
  const now = deps.now ?? (() => Date.now())
  const recentWindowMs = deps.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS
  const managed = deps.managed ?? { has: () => false }

  // Managed-ness is recomputed from the registry on every snapshot, not trusted from the stored row:
  // the registry is in-memory, so a Managed row left in the SQLite cache after a restart re-derives as
  // Observed (its pty is gone). This is the one place the discover.ts 'observed' default is overridden.
  const management = (id: string): Management => (managed.has(id) ? 'managed' : 'observed')

  // Last-resolved transcript path per session id. The Observed view polls one session every ~1.5s,
  // so caching the path lets a steady poll stat ONE file instead of re-walking all of projects/ each
  // time; the full sweep runs only on the first read or after the file moves/vanishes.
  const pathById = new Map<string, string>()

  return {
    id: 'claude',
    // What Claude Code can do; the surfaces land in later issues, but the capability contract is stable.
    capabilities: { canControl: true, hasRateLimits: true, hasSubagents: true },
    listCandidates: () => listCandidates({ claudeDir, isPidAlive, now: now(), recentWindowMs }),
    summarize: (c) => ({ ...summarize(c), management: management(c.id) }),
    restate: (c, prev) => ({ ...restate(c, prev), management: management(c.id) }),
    readTranscript: (id, sinceMtimeMs) => {
      try {
        // Fast path: stat the last-known file for this id, avoiding a projects/ sweep per poll.
        let path = pathById.get(id)
        let mtimeMs: number | undefined
        if (path !== undefined) {
          try {
            mtimeMs = statSync(path).mtimeMs
          } catch {
            pathById.delete(id) // moved/deleted — fall through to a fresh sweep
            path = undefined
          }
        }
        // Slow path: resolve by id from the projects sweep (freshest wins if an id appears twice).
        if (path === undefined) {
          const hit = indexTranscripts(claudeDir).get(id)
          if (!hit) return { status: 'absent' }
          path = hit.path
          mtimeMs = hit.mtimeMs
          pathById.set(id, path)
        }
        // Unchanged since the caller last saw it — skip the read AND the parse, not just the render.
        if (mtimeMs === sinceMtimeMs) return { status: 'unchanged', mtimeMs: mtimeMs! }

        const jsonl = readTextOrNull(path)
        if (jsonl === null) {
          pathById.delete(id)
          return { status: 'absent' } // ENOENT — genuinely gone (bounding a large read is issue #20)
        }
        return { status: 'changed', mtimeMs: mtimeMs!, doc: parseTranscriptEvents(jsonl) }
      } catch {
        // A non-ENOENT read failure (EACCES, EIO, …) is transient, not absence. Degrade like
        // summarize does: report an error so the view keeps its last doc, rather than rejecting the
        // IPC or masquerading as "no transcript".
        return { status: 'error' }
      }
    },
  }
}
