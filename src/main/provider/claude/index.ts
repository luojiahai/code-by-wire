import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Provider } from '../types'
import { discoverSessions } from './discover'

export interface ClaudeProviderDeps {
  claudeDir?: string
  isPidAlive?: (pid: number) => boolean
}

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
  const claudeDir = deps.claudeDir ?? join(homedir(), '.claude')
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive

  return {
    id: 'claude',
    // What Claude Code can do; the surfaces land in later issues, but the
    // capability contract is stable now.
    capabilities: { canControl: true, hasRateLimits: true, hasSubagents: true },
    async listSessions() {
      return discoverSessions({ claudeDir, isPidAlive })
    },
  }
}
