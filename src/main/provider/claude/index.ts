import type { Provider } from '../types'
import { resolveClaudeDir } from '../../claude-config'
import { listCandidates, summarize, restate } from './discover'

export interface ClaudeProviderDeps {
  claudeDir?: string
  isPidAlive?: (pid: number) => boolean
  /** Clock for the recency cut; defaults to the wall clock, overridden in tests. */
  now?: () => number
  /** How recent (ms) an Ended session's transcript must be to surface; defaults to 7 days. */
  recentWindowMs?: number
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

  return {
    id: 'claude',
    // What Claude Code can do; the surfaces land in later issues, but the capability contract is stable.
    capabilities: { canControl: true, hasRateLimits: true, hasSubagents: true },
    listCandidates: () => listCandidates({ claudeDir, isPidAlive, now: now(), recentWindowMs }),
    summarize,
    restate,
  }
}
