import type { ContextBreakdown, DiffHunk, TranscriptDoc, TranscriptEvent, TurnSummary } from '@shared/transcript'
import { extractCommandName, promptLabel, stripCommandEnvelope } from './command-envelope'
import { parseJsonlRows, userText, usageBreakdown } from './transcript-row'

/** Tools whose edit we render as a diff rather than a generic tool call. */
const DIFF_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])
/** Tools that dispatch a subagent. */
const SUBAGENT_TOOLS = new Set(['Task', 'Agent'])

/** Split a possibly-multiline string into lines; a non-string or '' → [] so that side renders nothing. */
function lines(s: unknown): string[] {
  return typeof s === 'string' && s.length ? s.split('\n') : []
}

/** A short, human label for a tool call's input: the most telling field, else compact JSON. */
function summarizeInput(input: Record<string, unknown>): string {
  for (const key of ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description']) {
    const v = input[key]
    if (typeof v === 'string' && v.trim()) return v
  }
  try {
    const json = JSON.stringify(input)
    return json.length > 200 ? json.slice(0, 199) + '…' : json
  } catch {
    return ''
  }
}

/** The removed/added lines for an edit tool's input (Edit / Write / MultiEdit). */
function diffHunk(tool: string, input: Record<string, unknown>): DiffHunk {
  if (tool === 'Write') return { removed: [], added: lines(input.content) }
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    const removed: string[] = []
    const added: string[] = []
    for (const e of input.edits) {
      removed.push(...lines(e?.old_string))
      added.push(...lines(e?.new_string))
    }
    return { removed, added }
  }
  return { removed: lines(input.old_string), added: lines(input.new_string) }
}

/** A pending tool_use's reason and whether it's a direct question to the user. */
interface PendingReason {
  reason: string
  question: boolean
}

/** A waiting reason for one unanswered tool_use: the question(s) for AskUserQuestion, else a
 *  permission line naming the pending tool. */
function reasonForTool(name: string, input: Record<string, unknown>): PendingReason {
  if (name === 'AskUserQuestion') {
    const qs = Array.isArray(input.questions)
      ? input.questions.map((q) => (typeof q?.question === 'string' ? q.question : '')).filter(Boolean)
      : []
    return { reason: qs.length ? qs.join(' · ') : 'Waiting on a question', question: true }
  }
  return { reason: `Permission: ${name}`, question: false }
}

/**
 * Project parsed transcript rows into render-ready events, a waiting reason, a turn-by-turn timeline, and
 * the current context's cache-state split — all in one pass. Pure: same input, same output. Subagent-
 * internal turns (isSidechain) are dropped — the dispatch is surfaced from the parent's Task tool_use,
 * and a subagent's own tools/time don't count toward the parent turn. The read parses the JSONL once
 * (see parseTranscriptEvents) and feeds the same rows here and to the subagent reconstruction.
 */
export function parseTranscriptEventsFromRows(rows: any[]): Omit<TranscriptDoc, 'subagents'> {
  const events: TranscriptEvent[] = []

  // Unanswered tool_use ids from the LATEST assistant turn, each mapped to its reason. Reset when a NEW
  // turn begins (keyed on message.id) and cleared by a tool_result. A non-empty map at EOF means the
  // tail is blocked on the user. (See the longer rationale that previously lived here — unchanged.)
  let pending = new Map<string, PendingReason>()
  let turn: string | undefined // message.id of the turn `pending` belongs to

  // Timeline + current-context accumulators. `open` is the turn being built (a user prompt and the
  // assistant work up to the next prompt); finalized into `turns` on the next prompt and at EOF.
  // `context` holds the latest assistant turn's usage split — the current context size by cache state.
  const turns: TurnSummary[] = []
  let open: TurnSummary | null = null
  let lastTs = 0 // most recent valid timestamp; a fallback for a row that lacks one
  let sawTs = false // has any row carried a parseable timestamp yet?
  let openStartPending = false // the open turn began before any timestamp existed; adopt the first one
  let context: ContextBreakdown | null = null

  const finalizeOpen = (): void => {
    if (!open) return
    open.durationMs = Math.max(0, open.endMs - open.startMs)
    turns.push(open)
    open = null
  }

  // Extend the open turn's clock to a row's timestamp. A turn that opened before any timestamp existed
  // adopts the first one as its start — so a missing leading timestamp can't leave startMs at epoch 0
  // while a later real timestamp inflates the duration (and the "ago" readout) to ~50000 years.
  const extendClock = (ts: number): void => {
    if (!open) return
    if (openStartPending) {
      open.startMs = ts
      openStartPending = false
    }
    open.endMs = Math.max(open.endMs, ts)
  }

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    if (row.isSidechain) continue // subagent-internal turn; not part of the conversation or its timeline

    const tsParsed = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN
    const hasTs = !Number.isNaN(tsParsed)
    if (hasTs) {
      lastTs = tsParsed
      sawTs = true
    }

    const content = row.message?.content

    if (row.type === 'user') {
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b?.type === 'tool_result' && typeof b.tool_use_id === 'string') pending.delete(b.tool_use_id)
        }
      }
      if (row.isMeta) {
        if (hasTs) extendClock(tsParsed)
        continue
      }
      const raw = userText(content)
      if (raw) {
        // A real user prompt closes the previous turn and opens a new one.
        finalizeOpen()
        const start = hasTs ? tsParsed : lastTs
        open = { index: turns.length + 1, prompt: promptLabel(raw), startMs: start, endMs: start, durationMs: 0, toolCount: 0 }
        openStartPending = !hasTs && !sawTs
        const command = extractCommandName(raw)
        events.push({ kind: 'user', text: command || stripCommandEnvelope(raw).trim() })
        continue
      }
      // A tool_result-only (or empty) user turn belongs to the current turn — extend its clock.
      if (hasTs) extendClock(tsParsed)
      continue
    }

    if (row.type === 'assistant') {
      // A new turn (new message.id) supersedes the last; only its own tools can still block. Lines of
      // the same turn keep accumulating into `pending`. An id-less row is treated as its own turn.
      const id = typeof row.message?.id === 'string' ? row.message.id : undefined
      if (id === undefined || id !== turn) {
        pending = new Map()
        turn = id
      }
      if (hasTs) extendClock(tsParsed)

      // Current context = the latest assistant turn's prompt, split by cache state. A zero-sum usage
      // block (e.g. a '<synthetic>' placeholder) yields null and leaves the last real split intact.
      const bd = usageBreakdown(row.message?.usage)
      if (bd) context = bd

      if (!Array.isArray(content)) continue
      for (const b of content) {
        if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          events.push({ kind: 'assistant', text: b.text })
        } else if (b?.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
          events.push({ kind: 'thinking', text: b.thinking })
        } else if (b?.type === 'tool_use' && typeof b.name === 'string') {
          if (open) open.toolCount++
          const input = (b.input && typeof b.input === 'object' ? b.input : {}) as Record<string, unknown>
          if (SUBAGENT_TOOLS.has(b.name)) {
            events.push({
              kind: 'subagent',
              agentType: typeof input.subagent_type === 'string' ? input.subagent_type : b.name,
              description: typeof input.description === 'string' ? input.description : '',
            })
          } else if (DIFF_TOOLS.has(b.name)) {
            events.push({ kind: 'diff', tool: b.name, file: typeof input.file_path === 'string' ? input.file_path : '', hunk: diffHunk(b.name, input) })
          } else {
            events.push({ kind: 'tool', name: b.name, input: summarizeInput(input) })
          }
          if (typeof b.id === 'string') pending.set(b.id, reasonForTool(b.name, input))
        }
      }
    }
  }

  finalizeOpen()

  // Surface the actual question when a turn blocks on several tools at once; else the first pending tool
  // in turn order. `.find`-style short-circuit, so no array is materialized in the common case.
  const reasons = pending.values()
  let pick: PendingReason | undefined
  for (const r of reasons) {
    if (!pick) pick = r
    if (r.question) {
      pick = r
      break
    }
  }
  return { events, waitingReason: pick?.reason ?? null, turns, context }
}

/** Parse a transcript's JSONL and project it (see parseTranscriptEventsFromRows). Skips blank and
 *  unparseable lines, so a half-written trailing line during an append is fine. */
export function parseTranscriptEvents(jsonl: string): Omit<TranscriptDoc, 'subagents'> {
  return parseTranscriptEventsFromRows(parseJsonlRows(jsonl))
}
