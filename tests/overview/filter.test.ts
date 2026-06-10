import { describe, it, expect } from 'vitest'
import { filterSessions, stateCounts } from '@shared/overview'
import type { Session, SessionState } from '@shared/types'

function s(id: string, state: SessionState): Session {
  return {
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
  }
}

const fixture = (): Session[] => [
  s('a', 'working'),
  s('b', 'waiting'),
  s('c', 'idle'),
  s('d', 'waiting'),
  s('e', 'ended'),
]

describe('filterSessions', () => {
  it("returns every Session for 'all'", () => {
    expect(filterSessions(fixture(), 'all').map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('keeps only the matching state, preserving order', () => {
    expect(filterSessions(fixture(), 'waiting').map((x) => x.id)).toEqual(['b', 'd'])
    expect(filterSessions(fixture(), 'ended').map((x) => x.id)).toEqual(['e'])
  })

  it('does not mutate its input', () => {
    const input = fixture()
    filterSessions(input, 'waiting')
    expect(input.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

describe('stateCounts', () => {
  it('counts each state plus the all-total', () => {
    expect(stateCounts(fixture())).toEqual({ all: 5, working: 1, waiting: 2, idle: 1, ended: 1 })
  })

  it('is zero everywhere on an empty list', () => {
    expect(stateCounts([])).toEqual({ all: 0, working: 0, waiting: 0, idle: 0, ended: 0 })
  })
})
