import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseTranscript, deriveTitle, firstTranscriptCwd } from '../../src/main/provider/claude/transcript'

const fx = (p: string) => readFileSync(resolve('tests/fixtures/claude-home', p), 'utf8')

describe('parseTranscript', () => {
  it('extracts title, project, branch, model, and last activity', () => {
    const s = parseTranscript(
      fx('projects/-work-code-by-wire/aaaa1111-1111-1111-1111-111111111111.jsonl'),
    )
    expect(s.title).toBe('Add a login form to the settings page')
    expect(s.project).toBe('code-by-wire')
    expect(s.cwd).toBe('/work/code-by-wire')
    expect(s.branch).toBe('feature/login')
    expect(s.model).toBe('claude-sonnet-4-6')
    expect(s.lastActivityMs).toBe(Date.parse('2026-06-08T22:54:06.078Z'))
    expect(s.awaitingUser).toBe(false)
    // The fixture's single assistant turn carries usage {input:100, output:50, cache_read:10, cache_creation:5}.
    expect(s.usage).toEqual({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheCreationTokens: 5 })
    expect(s.contextTokens).toBe(115) // latest turn: input (100) + cache-read (10) + cache-creation (5)
  })

  it('strips slash-command wrappers, skips meta lines, and tolerates malformed json', () => {
    const s = parseTranscript(
      fx('projects/-work-api-service/cccc3333-3333-3333-3333-333333333333.jsonl'),
    )
    expect(s.title).toBe('deploy')
    expect(s.model).toBe('claude-opus-4-8')
    expect(s.project).toBe('api-service')
    expect(s.branch).toBe('main')
  })

  it('derives a title from array-form user content (content blocks)', () => {
    const jsonl = JSON.stringify({
      type: 'user',
      isMeta: false,
      cwd: '/work/app',
      message: { role: 'user', content: [{ type: 'text', text: 'Add pagination to the list view' }] },
    })
    expect(parseTranscript(jsonl).title).toBe('Add pagination to the list view')
  })

  it('ignores tool-result blocks and finds the first real text prompt', () => {
    const jsonl = [
      {
        type: 'user',
        isMeta: false,
        cwd: '/work/app',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'output' }] },
      },
      {
        type: 'user',
        isMeta: false,
        cwd: '/work/app',
        message: { role: 'user', content: [{ type: 'text', text: 'Fix the flaky test' }] },
      },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    expect(parseTranscript(jsonl).title).toBe('Fix the flaky test')
  })

  it('flags awaitingUser when the last turn leaves a tool use unanswered', () => {
    const jsonl = [
      { type: 'user', isMeta: false, cwd: '/work/app', message: { role: 'user', content: 'Run the migration' } },
      {
        type: 'assistant',
        timestamp: '2026-06-09T01:00:00.000Z',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-8',
          content: [
            { type: 'text', text: 'Running it now.' },
            { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'make migrate' } },
          ],
        },
      },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    expect(parseTranscript(jsonl).awaitingUser).toBe(true)
  })

  it('clears awaitingUser once the tool use has a result', () => {
    const jsonl = [
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} }] } },
      { type: 'user', isMeta: false, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'done' }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    expect(parseTranscript(jsonl).awaitingUser).toBe(false)
  })

  it('keeps awaitingUser true when only one of several tool uses is answered', () => {
    const jsonl = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} },
            { type: 'tool_use', id: 'toolu_2', name: 'Read', input: {} },
          ],
        },
      },
      {
        type: 'user',
        isMeta: false,
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'done' }] },
      },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    expect(parseTranscript(jsonl).awaitingUser).toBe(true)
  })

  it('leaves awaitingUser false for a plain completed turn', () => {
    const jsonl = [
      { type: 'user', isMeta: false, cwd: '/work/app', message: { role: 'user', content: 'Summarize the file' } },
      { type: 'assistant', message: { role: 'assistant', model: 'claude-opus-4-8', content: [{ type: 'text', text: 'Here is the summary.' }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    expect(parseTranscript(jsonl).awaitingUser).toBe(false)
  })

  it('does not latch awaitingUser on a tool_use the user interrupted earlier in the session', () => {
    // The assistant started a tool, the user cut it off with a new prompt instead of letting it
    // return, and the session finished cleanly. The abandoned tool_use lives in the file forever;
    // it must not keep the session pinned to Waiting. (96% of real awaitingUser=true cases are this.)
    const jsonl = [
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_interrupted', name: 'Read', input: {} }] } },
      { type: 'user', isMeta: false, message: { role: 'user', content: 'actually, do this instead' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    expect(parseTranscript(jsonl).awaitingUser).toBe(false)
  })

  it('reflects only the latest assistant turn, not an earlier abandoned tool_use', () => {
    // Interrupted tool, then a fresh turn whose own tool gets answered. Only the last turn counts.
    const jsonl = [
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_old', name: 'Bash', input: {} }] } },
      { type: 'user', isMeta: false, message: { role: 'user', content: 'stop, read this first' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_new', name: 'Read', input: {} }] } },
      { type: 'user', isMeta: false, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_new', content: 'ok' }] } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'All set.' }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    expect(parseTranscript(jsonl).awaitingUser).toBe(false)
  })

  it('sums usage across assistant turns and takes the latest turn for context size', () => {
    const jsonl = [
      { type: 'user', isMeta: false, cwd: '/w/app', message: { role: 'user', content: 'go' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-8',
          usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 800 },
        },
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-8',
          usage: { input_tokens: 1500, output_tokens: 300, cache_read_input_tokens: 9000, cache_creation_input_tokens: 400 },
        },
      },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    const s = parseTranscript(jsonl)
    expect(s.usage).toEqual({ inputTokens: 2500, outputTokens: 500, cacheReadTokens: 14000, cacheCreationTokens: 1200 })
    expect(s.contextTokens).toBe(10900) // latest turn only: 1500 + 9000 + 400, not the running sum
  })

  it('treats assistant turns with no usage block as zero', () => {
    const jsonl = [
      { type: 'user', isMeta: false, cwd: '/w/app', message: { role: 'user', content: 'go' } },
      { type: 'assistant', message: { role: 'assistant', model: 'claude-opus-4-8', content: [{ type: 'text', text: 'done' }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    const s = parseTranscript(jsonl)
    expect(s.usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 })
    expect(s.contextTokens).toBe(0)
  })

  it('counts each assistant turn once even when it is split across content-block lines', () => {
    // Claude Code writes one assistant turn across several JSONL lines (one per content block),
    // each repeating the same message id and the same usage block. Summing every line would
    // multiply the turn's tokens (2x-7x on real transcripts).
    const line = (id: string, usage: object, text: string) => ({
      type: 'assistant',
      message: { role: 'assistant', id, model: 'claude-opus-4-8', usage, content: [{ type: 'text', text }] },
    })
    const u1 = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 800 }
    const u2 = { input_tokens: 1500, output_tokens: 300, cache_read_input_tokens: 9000, cache_creation_input_tokens: 400 }
    const jsonl = [
      { type: 'user', isMeta: false, cwd: '/w/app', message: { role: 'user', content: 'go' } },
      line('msg_1', u1, 'first part'),
      line('msg_1', u1, 'second part'),
      line('msg_2', u2, 'next turn'),
      line('msg_2', u2, 'still next turn'),
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    const s = parseTranscript(jsonl)
    // Two distinct turns; each turn's usage is counted once despite its repeated lines.
    expect(s.usage).toEqual({ inputTokens: 2500, outputTokens: 500, cacheReadTokens: 14000, cacheCreationTokens: 1200 })
    expect(s.contextTokens).toBe(10900) // latest turn (msg_2): 1500 + 9000 + 400
  })

  it('counts the just-written cache-creation tokens in the current context size', () => {
    // The latest turn's prompt = input + cache_read + cache_creation. A turn that just cached a big
    // new chunk holds it in context now, before it migrates to cache_read on the next turn.
    const jsonl = [
      { type: 'user', isMeta: false, cwd: '/w/app', message: { role: 'user', content: 'go' } },
      { type: 'assistant', message: { role: 'assistant', id: 'msg_1', model: 'claude-opus-4-8', usage: { input_tokens: 2000, output_tokens: 100, cache_read_input_tokens: 50000, cache_creation_input_tokens: 40000 } } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    expect(parseTranscript(jsonl).contextTokens).toBe(92000) // 2000 + 50000 + 40000
  })

  it('ignores a trailing <synthetic> turn when determining the model', () => {
    // Claude Code injects '<synthetic>' assistant turns (cancelled / over-limit placeholders)
    // that carry a zero usage block. They must not override the real model with the Opus default.
    const jsonl = [
      { type: 'user', isMeta: false, cwd: '/w/app', message: { role: 'user', content: 'go' } },
      { type: 'assistant', message: { role: 'assistant', id: 'msg_1', model: 'claude-sonnet-4-6', usage: { input_tokens: 4000, output_tokens: 100, cache_read_input_tokens: 60000, cache_creation_input_tokens: 2000 } } },
      { type: 'assistant', message: { role: 'assistant', id: 'msg_synth', model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, content: [{ type: 'text', text: 'Prompt is too long' }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    expect(parseTranscript(jsonl).model).toBe('claude-sonnet-4-6')
  })

  it('keeps the last real context size when a trailing turn carries zero usage', () => {
    // A '<synthetic>' (or otherwise empty) final turn has input + cache_read = 0; it must not
    // overwrite the real context size with 0, and its zero usage must not change the sums.
    const jsonl = [
      { type: 'user', isMeta: false, cwd: '/w/app', message: { role: 'user', content: 'go' } },
      { type: 'assistant', message: { role: 'assistant', id: 'msg_1', model: 'claude-opus-4-8', usage: { input_tokens: 4000, output_tokens: 100, cache_read_input_tokens: 60000, cache_creation_input_tokens: 2000 } } },
      { type: 'assistant', message: { role: 'assistant', id: 'msg_synth', model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    const s = parseTranscript(jsonl)
    expect(s.contextTokens).toBe(66000) // msg_1: 4000 + 60000 + 2000, not zeroed by the synthetic turn
    expect(s.usage).toEqual({ inputTokens: 4000, outputTokens: 100, cacheReadTokens: 60000, cacheCreationTokens: 2000 })
  })
})

describe('firstTranscriptCwd', () => {
  it('returns the cwd from the first row that carries one', () => {
    const jsonl = [
      { type: 'user', isMeta: false, cwd: '/work/app', message: { role: 'user', content: 'go' } },
      { type: 'assistant', cwd: '/work/app', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n')
    expect(firstTranscriptCwd(jsonl)).toBe('/work/app')
  })

  it('skips blank and malformed leading lines, then a row with no cwd', () => {
    const jsonl = [
      '',
      '{ not json',
      JSON.stringify({ type: 'summary', message: { content: 'no cwd here' } }),
      JSON.stringify({ type: 'user', cwd: '/w/recovered', message: { content: 'hi' } }),
    ].join('\n')
    expect(firstTranscriptCwd(jsonl)).toBe('/w/recovered')
  })

  it('returns empty string when no row resolves a cwd', () => {
    expect(firstTranscriptCwd('{"type":"user","message":{"content":"hi"}}')).toBe('')
    expect(firstTranscriptCwd('')).toBe('')
  })
})

describe('deriveTitle', () => {
  it('falls back to the project basename when there is no prose', () => {
    expect(deriveTitle([], '/work/empty-proj')).toBe('empty-proj')
  })

  it('skips empty prompts and picks the first real one', () => {
    expect(
      deriveTitle(['<command-message></command-message>', '   ', 'Fix the timeout bug'], '/x/y'),
    ).toBe('Fix the timeout bug')
  })

  it('surfaces the command name for a slash-command turn, not the stripped soup', () => {
    expect(
      deriveTitle(
        [
          '<command-name>/code-review</command-name>\n<command-message>code-review</command-message>',
        ],
        '/x/y',
      ),
    ).toBe('/code-review')
  })

  it('keeps prose containing angle-bracket operators, JSX, and generics intact', () => {
    expect(deriveTitle(['Why does a < b && b > c fail?'], '/x/y')).toBe(
      'Why does a < b && b > c fail?',
    )
    expect(deriveTitle(['Render <Button onClick={fn}/> in the modal'], '/x/y')).toBe(
      'Render <Button onClick={fn}/> in the modal',
    )
  })
})
