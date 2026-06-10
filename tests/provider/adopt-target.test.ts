import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveAdoptTarget } from '../../src/main/provider/claude/adopt-target'
import { tempHomes } from '../helpers/temp-home'

const makeHome = tempHomes('cbw-adopt-')

function writeSessionFile(home: string, raw: Record<string, unknown>): void {
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'sessions', `${raw.pid}.json`), JSON.stringify(raw))
}
function writeTranscript(home: string, proj: string, id: string, body: string): void {
  const dir = join(home, 'projects', proj)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${id}.jsonl`), body)
}

describe('resolveAdoptTarget', () => {
  it('recovers cwd from the transcript for an Ended session whose registry file was reaped', () => {
    const home = makeHome()
    writeTranscript(home, '-w-app', 'ended-1', '{"type":"user","cwd":"/w/app","message":{"content":"hi"}}\n')
    // isPidAlive returns true, but with no registry entry there is no process to be alive.
    expect(resolveAdoptTarget({ claudeDir: home, isPidAlive: () => true, id: 'ended-1' })).toEqual({
      alive: false,
      cwd: '/w/app',
    })
  })

  it('reports alive with the registry cwd when a live process owns the id', () => {
    const home = makeHome()
    writeSessionFile(home, { pid: 100, sessionId: 'live-1', cwd: '/w/live', status: 'busy', updatedAt: 5 })
    expect(resolveAdoptTarget({ claudeDir: home, isPidAlive: (pid) => pid === 100, id: 'live-1' })).toEqual({
      alive: true,
      cwd: '/w/live',
    })
  })

  it('reports not alive when the registry pid is dead', () => {
    const home = makeHome()
    writeSessionFile(home, { pid: 999, sessionId: 'dead-1', cwd: '/w/dead', status: 'idle', updatedAt: 5 })
    expect(resolveAdoptTarget({ claudeDir: home, isPidAlive: () => false, id: 'dead-1' })).toEqual({
      alive: false,
      cwd: '/w/dead',
    })
  })

  it('returns null when neither a registry entry nor a transcript resolves a cwd', () => {
    const home = makeHome()
    expect(resolveAdoptTarget({ claudeDir: home, isPidAlive: () => false, id: 'ghost' })).toBeNull()
  })
})
