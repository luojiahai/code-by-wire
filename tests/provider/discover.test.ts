import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { discoverSessions, readSessionFiles } from '../../src/main/provider/claude/discover'

const CLAUDE_DIR = resolve('tests/fixtures/claude-home')

const tmpHomes: string[] = []
function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'cbw-'))
  tmpHomes.push(home)
  return home
}
afterEach(() => {
  for (const home of tmpHomes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function writeSessionFile(home: string, raw: Record<string, unknown>): void {
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'sessions', `${raw.pid}.json`), JSON.stringify(raw))
}

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

  it('keeps a session whose transcript path cannot be read, using skeleton fallbacks', () => {
    const home = makeHome()
    writeSessionFile(home, { pid: 42, sessionId: 'sess-1', cwd: '/work/widget', updatedAt: 123 })
    // A transcript path that exists but is not a readable file (a directory → EISDIR on read).
    mkdirSync(join(home, 'projects', '-work-widget', 'sess-1.jsonl'), { recursive: true })

    const sessions = discoverSessions({ claudeDir: home, isPidAlive: () => true })

    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe('sess-1')
    expect(sessions[0].title).toBe('widget') // basename(cwd) fallback, not a thrown error
    expect(sessions[0].lastActivityMs).toBe(123)
  })

  it('still lists sessions when the projects directory is unreadable', () => {
    const home = makeHome()
    writeSessionFile(home, { pid: 7, sessionId: 'sess-x', cwd: '/work/thing', updatedAt: 99 })
    writeFileSync(join(home, 'projects'), 'not a directory') // readdir → ENOTDIR

    const sessions = discoverSessions({ claudeDir: home, isPidAlive: () => true })

    expect(sessions).toHaveLength(1)
    expect(sessions[0].title).toBe('thing')
  })
})

describe('readSessionFiles', () => {
  it('returns no sessions instead of throwing when the sessions path is not a directory', () => {
    const home = makeHome()
    writeFileSync(join(home, 'sessions'), 'not a directory') // readdir → ENOTDIR

    expect(readSessionFiles(home)).toEqual([])
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
