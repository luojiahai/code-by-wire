import { describe, it, expect } from 'vitest'
import { parseTranscriptEvents } from '../../src/main/provider/claude/transcript-events'

const jsonl = (...rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n')

describe('parseTranscriptEvents — events', () => {
  it('renders user and assistant text in order', () => {
    const { events } = parseTranscriptEvents(
      jsonl(
        { type: 'user', isMeta: false, message: { role: 'user', content: 'Add login' } },
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'On it.' }] } },
      ),
    )
    expect(events).toEqual([
      { kind: 'user', text: 'Add login' },
      { kind: 'assistant', text: 'On it.' },
    ])
  })

  it('surfaces a slash-command user turn by its command name', () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: 'user',
        isMeta: false,
        message: { role: 'user', content: '<command-name>/deploy</command-name><command-message>deploy</command-message>' },
      }),
    )
    expect(events).toEqual([{ kind: 'user', text: '/deploy' }])
  })

  it('preserves multi-line prose (newlines kept, not collapsed)', () => {
    const { events } = parseTranscriptEvents(
      jsonl({ type: 'user', isMeta: false, message: { role: 'user', content: 'line one\nline two' } }),
    )
    expect(events).toEqual([{ kind: 'user', text: 'line one\nline two' }])
  })

  it('renders a thinking block', () => {
    const { events } = parseTranscriptEvents(
      jsonl({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }] } }),
    )
    expect(events).toEqual([{ kind: 'thinking', text: 'hmm' }])
  })

  it('renders a generic tool call with a summarized input', () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'pnpm test' } }] },
      }),
    )
    expect(events).toEqual([{ kind: 'tool', name: 'Bash', input: 'pnpm test' }])
  })

  it('renders an Edit as a diff of removed/added lines', () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'a.ts', old_string: 'a\nb', new_string: 'a\nc' } }],
        },
      }),
    )
    expect(events).toEqual([{ kind: 'diff', tool: 'Edit', file: 'a.ts', hunk: { removed: ['a', 'b'], added: ['a', 'c'] } }])
  })

  it('renders a Write as an all-added diff', () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Write', input: { file_path: 'new.ts', content: 'x\ny' } }] },
      }),
    )
    expect(events).toEqual([{ kind: 'diff', tool: 'Write', file: 'new.ts', hunk: { removed: [], added: ['x', 'y'] } }])
  })

  it('concatenates MultiEdit edits into one hunk', () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 't1',
              name: 'MultiEdit',
              input: { file_path: 'm.ts', edits: [{ old_string: 'o1', new_string: 'n1' }, { old_string: 'o2', new_string: 'n2' }] },
            },
          ],
        },
      }),
    )
    expect(events).toEqual([{ kind: 'diff', tool: 'MultiEdit', file: 'm.ts', hunk: { removed: ['o1', 'o2'], added: ['n1', 'n2'] } }])
  })

  it('renders a Task tool as a subagent dispatch', () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Task', input: { subagent_type: 'Explore', description: 'find usages' } }] },
      }),
    )
    expect(events).toEqual([{ kind: 'subagent', agentType: 'Explore', description: 'find usages' }])
  })

  it('renders an Agent tool as a subagent dispatch too', () => {
    const { events } = parseTranscriptEvents(
      jsonl({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { subagent_type: 'Plan', description: 'design the API' } }] },
      }),
    )
    expect(events).toEqual([{ kind: 'subagent', agentType: 'Plan', description: 'design the API' }])
  })

  it('emits a tool event even when the tool_use has no id', () => {
    const { events } = parseTranscriptEvents(
      jsonl({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } }),
    )
    expect(events).toEqual([{ kind: 'tool', name: 'Bash', input: 'ls' }])
  })

  it('skips meta user turns and tool_result-only user turns', () => {
    const { events } = parseTranscriptEvents(
      jsonl(
        { type: 'user', isMeta: true, message: { role: 'user', content: 'caveat noise' } },
        { type: 'user', isMeta: false, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'output' }] } },
        { type: 'user', isMeta: false, message: { role: 'user', content: 'real prompt' } },
      ),
    )
    expect(events).toEqual([{ kind: 'user', text: 'real prompt' }])
  })

  it('tolerates a half-written trailing line', () => {
    const { events } = parseTranscriptEvents(
      '{"type":"user","isMeta":false,"message":{"role":"user","content":"hi"}}\n{ broken',
    )
    expect(events).toEqual([{ kind: 'user', text: 'hi' }])
  })
})

describe('parseTranscriptEvents — waiting + sidechain', () => {
  it('reports a waiting reason from an unanswered AskUserQuestion at the tail', () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        { type: 'user', isMeta: false, message: { role: 'user', content: 'go' } },
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [{ question: 'A or B?' }] } }] } },
      ),
    )
    expect(waitingReason).toBe('A or B?')
  })

  it('joins multiple questions', () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [{ question: 'A?' }, { question: 'B?' }] } }] } }),
    )
    expect(waitingReason).toBe('A? · B?')
  })

  it('falls back to a generic reason for an AskUserQuestion with no questions', () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [] } }] } }),
    )
    expect(waitingReason).toBe('Waiting on a question')
  })

  it('reports a permission-style reason for a non-question pending tool', () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'rm -rf x' } }] } }),
    )
    expect(waitingReason).toBe('Permission: Bash')
  })

  it('clears the waiting reason once the tool has a result', () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: {} }] } },
        { type: 'user', isMeta: false, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'done' }] } },
      ),
    )
    expect(waitingReason).toBeNull()
  })

  it('accumulates parallel tool_use across lines of one turn (same message.id), favouring the question', () => {
    // Claude Code writes one assistant turn across several lines — one per content block — so a turn's
    // parallel tools land on separate lines under the same message.id. Both stay pending; the actual
    // question wins over a permission line.
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        { type: 'assistant', message: { role: 'assistant', id: 'm1', content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: {} }] } },
        { type: 'assistant', message: { role: 'assistant', id: 'm1', content: [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [{ question: 'Ship it?' }] } }] } },
      ),
    )
    expect(waitingReason).toBe('Ship it?')
  })

  it('keeps an earlier same-turn tool pending after a later one is answered', () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        { type: 'assistant', message: { role: 'assistant', id: 'm1', content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: {} }] } },
        { type: 'assistant', message: { role: 'assistant', id: 'm1', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: {} }] } },
        { type: 'user', isMeta: false, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'done' }] } },
      ),
    )
    expect(waitingReason).toBe('Permission: Read')
  })

  it('a new turn (new message.id) supersedes the previous turn’s pending tools', () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        { type: 'assistant', message: { role: 'assistant', id: 'm1', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: {} }] } },
        { type: 'assistant', message: { role: 'assistant', id: 'm2', content: [{ type: 'text', text: 'done' }] } },
      ),
    )
    expect(waitingReason).toBeNull()
  })

  it('does not latch on a tool the user interrupted earlier (only the latest turn counts)', () => {
    const { waitingReason } = parseTranscriptEvents(
      jsonl(
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'old', name: 'Read', input: {} }] } },
        { type: 'user', isMeta: false, message: { role: 'user', content: 'actually do this instead' } },
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } },
      ),
    )
    expect(waitingReason).toBeNull()
  })

  it('drops subagent-internal (isSidechain) turns', () => {
    const { events } = parseTranscriptEvents(
      jsonl(
        { type: 'user', isMeta: false, message: { role: 'user', content: 'parent prompt' } },
        { type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: 'subagent internal' }] } },
      ),
    )
    expect(events).toEqual([{ kind: 'user', text: 'parent prompt' }])
  })
})
