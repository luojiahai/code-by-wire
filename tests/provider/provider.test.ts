import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { createClaudeProvider } from '../../src/main/provider/claude'

describe('ClaudeProvider', () => {
  it('exposes capability flags and lists normalized sessions', async () => {
    const provider = createClaudeProvider({
      claudeDir: resolve('tests/fixtures/claude-home'),
      isPidAlive: (pid) => pid === 1001,
    })

    expect(provider.id).toBe('claude')
    expect(provider.capabilities).toEqual({
      canControl: true,
      hasRateLimits: true,
      hasSubagents: true,
    })

    const sessions = await provider.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe('aaaa1111-1111-1111-1111-111111111111')
  })
})
