import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClaudeProvider } from '../src/main/provider/claude'
import { tempHomes } from './helpers/temp-home'

const makeHome = tempHomes('cbw-metrics-')

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
}

function scaffold(): { claudeDir: string; id: string } {
  const claudeDir = makeHome()
  const repo = makeHome()
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t.t')
  git(repo, 'config', 'user.name', 'T')
  writeFileSync(join(repo, 'a.txt'), 'x\n')
  git(repo, 'add', 'a.txt')
  git(repo, 'commit', '-qm', 'init')

  const id = 'sess-1'
  const projDir = join(claudeDir, 'projects', 'proj')
  mkdirSync(projDir, { recursive: true })
  const rows = [
    { type: 'user', sessionId: id, cwd: repo, timestamp: '2026-06-11T00:00:00.000Z', message: { content: 'hi' } },
    {
      type: 'assistant',
      sessionId: id,
      cwd: repo,
      timestamp: '2026-06-11T00:00:10.000Z',
      message: { id: 'm1', model: 'claude-opus-4-8', usage: { input_tokens: 200, output_tokens: 1000 } },
    },
  ]
  writeFileSync(join(projDir, `${id}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return { claudeDir, id }
}

describe.skipIf(process.platform === 'win32')('provider.readMetrics', () => {
  it('returns token speed and git for the session, with a change token', () => {
    const { claudeDir, id } = scaffold()
    const provider = createClaudeProvider({ claudeDir })
    const r = provider.readMetrics(id)
    expect(r.status).toBe('changed')
    if (r.status !== 'changed') return
    expect(r.metrics.tokenSpeed?.outputTps).toBeCloseTo(100, 5)
    expect(r.metrics.git?.branch).toBe('main')
    expect(typeof r.mtimeMs).toBe('number')
  })

  it('skips the recompute when the change token is unchanged', () => {
    const { claudeDir, id } = scaffold()
    const provider = createClaudeProvider({ claudeDir })
    const first = provider.readMetrics(id)
    if (first.status !== 'changed') throw new Error('expected changed')
    expect(provider.readMetrics(id, first.mtimeMs).status).toBe('unchanged')
  })

  it('is absent for an unknown session', () => {
    const { claudeDir } = scaffold()
    expect(createClaudeProvider({ claudeDir }).readMetrics('nope').status).toBe('absent')
  })
})
