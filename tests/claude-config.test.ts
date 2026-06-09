import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveClaudeDir, readTextOrNull } from '../src/main/claude-config'

describe('resolveClaudeDir', () => {
  const saved = process.env.CLAUDE_CONFIG_DIR
  afterEach(() => {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = saved
  })

  it('uses an explicit override ahead of everything else', () => {
    process.env.CLAUDE_CONFIG_DIR = '/env/claude'
    expect(resolveClaudeDir('/explicit')).toBe('/explicit')
  })

  it('honors CLAUDE_CONFIG_DIR when no override is given', () => {
    process.env.CLAUDE_CONFIG_DIR = '/env/claude'
    expect(resolveClaudeDir()).toBe('/env/claude')
  })

  it('falls back to ~/.claude when neither override nor env var is set', () => {
    delete process.env.CLAUDE_CONFIG_DIR
    expect(resolveClaudeDir()).toBe(join(homedir(), '.claude'))
  })
})

describe('readTextOrNull', () => {
  const tmps: string[] = []
  afterEach(() => {
    for (const t of tmps.splice(0)) rmSync(t, { recursive: true, force: true })
  })
  function makeTmp(): string {
    const t = mkdtempSync(join(tmpdir(), 'cbw-cfg-'))
    tmps.push(t)
    return t
  }

  it('returns the file contents when it exists', () => {
    const dir = makeTmp()
    const file = join(dir, 'f.txt')
    writeFileSync(file, 'hello')
    expect(readTextOrNull(file)).toBe('hello')
  })

  it('returns null when the file is absent (ENOENT)', () => {
    const dir = makeTmp()
    expect(readTextOrNull(join(dir, 'nope.txt'))).toBeNull()
  })

  it('rethrows non-ENOENT errors instead of masquerading as absent', () => {
    const dir = makeTmp() // a directory, not a file → EISDIR, must surface
    expect(() => readTextOrNull(dir)).toThrow()
  })
})
