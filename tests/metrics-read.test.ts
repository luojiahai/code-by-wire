import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClaudeProvider } from '../src/main/provider/claude'
import { tempHomes } from './helpers/temp-home'

const makeHome = tempHomes('cbw-metrics-')

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
}

function initRepo(branch: string): string {
  const repo = makeHome()
  git(repo, 'init', '-q', '-b', branch)
  git(repo, 'config', 'user.email', 't@t.t')
  git(repo, 'config', 'user.name', 'T')
  writeFileSync(join(repo, 'a.txt'), 'x\n')
  git(repo, 'add', 'a.txt')
  git(repo, 'commit', '-qm', 'init')
  return repo
}

function writeTranscript(claudeDir: string, proj: string, id: string, rows: unknown[]): void {
  const projDir = join(claudeDir, 'projects', proj)
  mkdirSync(projDir, { recursive: true })
  writeFileSync(join(projDir, `${id}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
}

const turn = (id: string, cwd: string | undefined) => [
  { type: 'user', sessionId: id, cwd, timestamp: '2026-06-11T00:00:00.000Z', message: { content: 'hi' } },
  {
    type: 'assistant',
    sessionId: id,
    cwd,
    timestamp: '2026-06-11T00:00:10.000Z',
    message: { id: 'm1', usage: { input_tokens: 10, output_tokens: 50 } },
  },
]

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

  it('re-reads when the remote-control manifest changes though the transcript did not', () => {
    const { claudeDir, id } = scaffold()
    const provider = createClaudeProvider({ claudeDir })
    const first = provider.readMetrics(id)
    if (first.status !== 'changed') throw new Error('expected changed')
    expect(first.metrics.remoteControl).toBeNull()

    // Attach a remote bridge: a new manifest naming this session. No transcript or git change.
    const sessions = join(claudeDir, 'sessions')
    mkdirSync(sessions, { recursive: true })
    writeFileSync(join(sessions, '999.json'), JSON.stringify({ sessionId: id, bridgeSessionId: 'bridge-1' }))

    const second = provider.readMetrics(id, first.mtimeMs)
    expect(second.status).toBe('changed') // token folds in remote state, so the renderer refetches
    if (second.status !== 'changed') return
    expect(second.metrics.remoteControl).toBe(true)
  })

  it('resolves git once a cwd-less transcript gains a cwd, instead of pinning null forever', () => {
    const claudeDir = makeHome()
    const repo = initRepo('main')
    const id = 'sess-nocwd'
    writeTranscript(claudeDir, 'proj', id, [
      { type: 'user', sessionId: id, timestamp: '2026-06-11T00:00:00.000Z', message: { content: 'hi' } },
    ])
    const provider = createClaudeProvider({ claudeDir })
    const first = provider.readMetrics(id)
    if (first.status !== 'changed') throw new Error('expected changed')
    expect(first.metrics.git).toBeNull() // no cwd yet → no git

    writeTranscript(claudeDir, 'proj', id, turn(id, repo)) // a later row supplies the cwd
    const second = provider.readMetrics(id)
    expect(second.status).toBe('changed')
    if (second.status !== 'changed') return
    expect(second.metrics.git?.branch).toBe('main') // re-resolved, not pinned to the cwd-less first read
  })

  it('re-resolves cwd after readTranscript invalidates a moved transcript (shared path cache)', () => {
    const claudeDir = makeHome()
    const repoA = initRepo('main')
    const repoB = initRepo('develop')
    const id = 'sess-move'
    writeTranscript(claudeDir, 'projA', id, turn(id, repoA))
    const provider = createClaudeProvider({ claudeDir })
    const before = provider.readMetrics(id) // caches pathById=projA, cwdById=repoA
    if (before.status === 'changed') expect(before.metrics.git?.branch).toBe('main')

    // The transcript moves to a new project dir scoped to a different repo (resume elsewhere).
    rmSync(join(claudeDir, 'projects', 'projA', `${id}.jsonl`))
    writeTranscript(claudeDir, 'projB', id, turn(id, repoB))
    provider.readTranscript(id) // the transcript poll runs first and refreshes the shared path cache

    const after = provider.readMetrics(id)
    expect(after.status).toBe('changed')
    if (after.status !== 'changed') return
    expect(after.metrics.git?.branch).toBe('develop') // re-resolved to the new cwd, not the stale repoA
  })
})
