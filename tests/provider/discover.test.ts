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
  it('maps a live busy session to working with skeleton defaults', () => {
    const sessions = discoverSessions({ claudeDir: CLAUDE_DIR, isPidAlive: () => true })
    const a = sessions.find((s) => s.id === 'aaaa1111-1111-1111-1111-111111111111')!

    expect(a.title).toBe('Add a login form to the settings page')
    expect(a.project).toBe('code-by-wire')
    expect(a.branch).toBe('feature/login')
    expect(a.model).toBe('claude-sonnet-4-6')
    expect(a.management).toBe('observed')
    expect(a.state).toBe('working') // alive + status "busy"
    expect(a.lastActivityMs).toBe(Date.parse('2026-06-08T22:54:06.078Z'))

    // deferred-scope defaults (issues #5, #13)
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

  it('maps a live quiet session with a finished turn to idle', () => {
    const sessions = discoverSessions({ claudeDir: CLAUDE_DIR, isPidAlive: () => true })
    const c = sessions.find((s) => s.id === 'cccc3333-3333-3333-3333-333333333333')!
    expect(c.state).toBe('idle')
  })

  it('maps a live quiet session blocked on an unanswered prompt to waiting', () => {
    const sessions = discoverSessions({ claudeDir: CLAUDE_DIR, isPidAlive: () => true })
    const d = sessions.find((s) => s.id === 'dddd4444-4444-4444-4444-444444444444')!
    expect(d.state).toBe('waiting')
  })

  it('maps a live session whose status field is "waiting" to waiting (no transcript needed)', () => {
    // This is how real Claude Code reports a blocked session: status "waiting" in the
    // session file, often with no unanswered tool_use in the transcript tail.
    const sessions = discoverSessions({ claudeDir: CLAUDE_DIR, isPidAlive: () => true })
    const e = sessions.find((s) => s.id === 'eeee5555-5555-5555-5555-555555555555')!
    expect(e.state).toBe('waiting')
  })

  it('surfaces a dead session as ended instead of dropping it', () => {
    // Only 1001 is alive; the rest are gone and must read as ended, not vanish.
    const sessions = discoverSessions({ claudeDir: CLAUDE_DIR, isPidAlive: (pid) => pid === 1001 })
    const stateById = Object.fromEntries(sessions.map((s) => [s.id, s.state]))

    expect(stateById['aaaa1111-1111-1111-1111-111111111111']).toBe('working') // alive + busy
    expect(stateById['cccc3333-3333-3333-3333-333333333333']).toBe('ended') // dead
    // Dead beats a pending prompt: 1004 is gone, so it's ended even though it's awaiting the user.
    expect(stateById['dddd4444-4444-4444-4444-444444444444']).toBe('ended')
  })

  it('surfaces every well-formed session, alive or dead', () => {
    const sessions = discoverSessions({ claudeDir: CLAUDE_DIR, isPidAlive: () => false })
    const ids = sessions.map((s) => s.id).sort()
    expect(ids).toEqual([
      'aaaa1111-1111-1111-1111-111111111111',
      'bbbb2222-2222-2222-2222-222222222222',
      'cccc3333-3333-3333-3333-333333333333',
      'dddd4444-4444-4444-4444-444444444444',
      'eeee5555-5555-5555-5555-555555555555',
    ])
    expect(sessions.every((s) => s.state === 'ended')).toBe(true)
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

  it('falls back to "unknown" for a root cwd with no transcript', () => {
    const home = makeHome()
    writeSessionFile(home, { pid: 5, sessionId: 'sess-root', cwd: '/', updatedAt: 1 })

    const sessions = discoverSessions({ claudeDir: home, isPidAlive: () => true })

    expect(sessions[0].title).toBe('unknown')
    expect(sessions[0].project).toBe('unknown')
  })

  it('de-duplicates sessions that resolve to the same id', () => {
    const home = makeHome()
    writeSessionFile(home, { pid: 10, sessionId: 'same', cwd: '/work/a', updatedAt: 1 })
    writeSessionFile(home, { pid: 11, sessionId: 'same', cwd: '/work/b', updatedAt: 2 })

    const sessions = discoverSessions({ claudeDir: home, isPidAlive: () => true })

    expect(sessions.filter((s) => s.id === 'same')).toHaveLength(1)
  })

  it('reads a live session that has no transcript with skeleton fallbacks', () => {
    // Only 1002 is alive; it has no transcript, so it leans on the session-file fields.
    const sessions = discoverSessions({ claudeDir: CLAUDE_DIR, isPidAlive: (pid) => pid === 1002 })
    const b = sessions.find((s) => s.id === 'bbbb2222-2222-2222-2222-222222222222')!
    expect(b.title).toBe('old-thing')
    expect(b.project).toBe('old-thing')
    expect(b.branch).toBeUndefined()
    expect(b.lastActivityMs).toBe(1780950000000)
    expect(b.state).toBe('idle') // alive, no transcript → no pending prompt → idle
  })
})

describe('readSessionFiles', () => {
  it('returns no sessions instead of throwing when the sessions path is not a directory', () => {
    const home = makeHome()
    writeFileSync(join(home, 'sessions'), 'not a directory') // readdir → ENOTDIR

    expect(readSessionFiles(home)).toEqual([])
  })

  it('skips session files whose pid is not a positive number', () => {
    const home = makeHome()
    writeSessionFile(home, { pid: 0, sessionId: 'zero', cwd: '/work/x' })
    writeSessionFile(home, { pid: -3, sessionId: 'neg', cwd: '/work/y' })
    writeSessionFile(home, { pid: 9, sessionId: 'ok', cwd: '/work/z' })

    expect(readSessionFiles(home).map((s) => s.sessionId)).toEqual(['ok'])
  })
})
