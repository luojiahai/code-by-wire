import { describe, it, expect } from 'vitest'
import { buildClaudeCommand, buildResumeCommand } from '../../src/main/terminal/command'
import { newSessionId } from '../../src/shared/terminal'

describe('buildClaudeCommand', () => {
  it('pins the session id and maps the model to a stable CLI alias', () => {
    expect(buildClaudeCommand({ id: 'sid-1', model: 'claude-opus-4-8' })).toEqual({
      file: 'claude',
      args: ['--session-id', 'sid-1', '--model', 'opus'],
    })
    expect(buildClaudeCommand({ id: 'sid-2', model: 'claude-sonnet-4-6' }).args).toEqual([
      '--session-id',
      'sid-2',
      '--model',
      'sonnet',
    ])
    expect(buildClaudeCommand({ id: 'sid-3', model: 'claude-haiku-4-5' }).args).toContain('haiku')
  })

  it('honors an explicit bin override (the executable, not the args)', () => {
    const cmd = buildClaudeCommand({ id: 'x', model: 'claude-opus-4-8', bin: '/opt/bin/claude' })
    expect(cmd.file).toBe('/opt/bin/claude')
    expect(cmd.args[0]).toBe('--session-id')
  })
})

describe('buildResumeCommand', () => {
  it('resumes the session under its own id, with no --model (resume restores the model)', () => {
    expect(buildResumeCommand({ id: 'sid-9' })).toEqual({ file: 'claude', args: ['--resume', 'sid-9'] })
  })

  it('honors an explicit bin override (the executable, not the args)', () => {
    const cmd = buildResumeCommand({ id: 'x', bin: '/opt/bin/claude' })
    expect(cmd.file).toBe('/opt/bin/claude')
    expect(cmd.args).toEqual(['--resume', 'x'])
  })
})

describe('newSessionId', () => {
  it('returns a v4-shaped uuid', () => {
    expect(newSessionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('returns a fresh id each call', () => {
    expect(newSessionId()).not.toBe(newSessionId())
  })
})
