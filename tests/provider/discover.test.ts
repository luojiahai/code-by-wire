import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { discoverSessions } from '../../src/main/provider/claude/discover'

const CLAUDE_DIR = resolve('tests/fixtures/claude-home')

describe('discoverSessions', () => {
  it('includes only sessions whose pid is alive', () => {
    const alive = new Set([1001, 1003])
    const sessions = discoverSessions({
      claudeDir: CLAUDE_DIR,
      isPidAlive: (pid) => alive.has(pid),
    })
    const ids = sessions.map((s) => s.id).sort()
    expect(ids).toEqual([
      'aaaa1111-1111-1111-1111-111111111111',
      'cccc3333-3333-3333-3333-333333333333',
    ])
  })

  it('maps a live session into the normalized model with skeleton defaults', () => {
    const sessions = discoverSessions({ claudeDir: CLAUDE_DIR, isPidAlive: () => true })
    const a = sessions.find((s) => s.id === 'aaaa1111-1111-1111-1111-111111111111')!

    expect(a.title).toBe('Add a login form to the settings page')
    expect(a.project).toBe('code-by-wire')
    expect(a.branch).toBe('feature/login')
    expect(a.model).toBe('claude-sonnet-4-6')
    expect(a.management).toBe('observed')
    expect(a.state).toBe('working') // status "busy"
    expect(a.lastActivityMs).toBe(Date.parse('2026-06-08T22:54:06.078Z'))

    // issue #2 scope defaults
    expect(a.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    })
    expect(a.equivApiValueUsd).toBe(0)
    expect(a.contextPct).toBe(0)
    expect(a.contextWindow).toBe(200_000)
    expect(a.tasks).toEqual([])
    expect(a.subagents).toEqual([])
  })

  it('derives idle for non-busy sessions', () => {
    const sessions = discoverSessions({ claudeDir: CLAUDE_DIR, isPidAlive: () => true })
    const c = sessions.find((s) => s.id === 'cccc3333-3333-3333-3333-333333333333')!
    expect(c.state).toBe('idle')
  })

  it('falls back to cwd basename and updatedAt when a live session has no transcript', () => {
    const sessions = discoverSessions({ claudeDir: CLAUDE_DIR, isPidAlive: (pid) => pid === 1002 })
    expect(sessions).toHaveLength(1)
    const b = sessions[0]
    expect(b.id).toBe('bbbb2222-2222-2222-2222-222222222222')
    expect(b.title).toBe('old-thing')
    expect(b.project).toBe('old-thing')
    expect(b.branch).toBeUndefined()
    expect(b.lastActivityMs).toBe(1780950000000)
    expect(b.state).toBe('idle')
  })
})
