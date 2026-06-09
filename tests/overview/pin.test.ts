import { describe, it, expect } from 'vitest'
import { pinWaiting } from '@shared/overview'
import type { Session, SessionState } from '@shared/types'

const s = (id: string, state: SessionState): Session => ({
  id,
  title: id,
  project: 'p',
  state,
  management: 'observed',
  model: 'claude-opus-4-8',
  contextPct: 0,
  contextWindow: 200_000,
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  equivApiValueUsd: 0,
  lastActivityMs: 0,
  tasks: [],
  subagents: [],
})

describe('pinWaiting', () => {
  it('moves Waiting above the rest, preserving order within each group', () => {
    const ordered = pinWaiting([s('a', 'working'), s('b', 'waiting'), s('c', 'idle'), s('d', 'waiting')])
    expect(ordered.map((x) => x.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('is a no-op ordering when nothing is Waiting', () => {
    const input = [s('a', 'working'), s('b', 'idle'), s('c', 'ended')]
    expect(pinWaiting(input).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('preserves input order when all are Waiting', () => {
    const input = [s('a', 'waiting'), s('b', 'waiting'), s('c', 'waiting')]
    expect(pinWaiting(input).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate its input', () => {
    const input = [s('a', 'idle'), s('b', 'waiting')]
    pinWaiting(input)
    expect(input.map((x) => x.id)).toEqual(['a', 'b'])
  })
})
