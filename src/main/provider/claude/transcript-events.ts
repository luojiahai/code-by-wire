import type { DiffHunk, TranscriptDoc, TranscriptEvent } from '@shared/transcript'
import { extractCommandName, stripCommandEnvelope } from './command-envelope'

/** Tools whose edit we render as a diff rather than a generic tool call. */
const DIFF_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])
/** Tools that dispatch a subagent. */
const SUBAGENT_TOOLS = new Set(['Task', 'Agent'])

/** Split a possibly-multiline string into lines; a non-string or '' → [] so that side renders nothing. */
function lines(s: unknown): string[] {
  return typeof s === 'string' && s.length ? s.split('\n') : []
}

/** A user turn's text whether stored as a plain string or content blocks (text blocks only). Mirrors
 *  the helper in transcript.ts; kept local so the two parsers stay independent. */
function userText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b?.type === 'text' && typeof b?.text === 'string')
      .map((b) => b.text)
      .join('\n')
  }
  return ''
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

/** A pending tool_use's reason and whether it's a direct question to the user. `question` lets the
 *  waiting-reason pick favour an actual AskUserQuestion over a permission line when a turn fires
 *  several tools at once. */
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
 * Project a transcript's JSONL into render-ready events plus a waiting reason. Pure: same input,
 * same output. Parses line by line and skips any unparseable line, so a transcript being appended to
 * right now (a half-written trailing line) is fine. Subagent-internal turns (isSidechain) are dropped
 * — the dispatch is surfaced from the parent's Task tool_use; the full subagent tree is issue #13.
 */
export function parseTranscriptEvents(jsonl: string): TranscriptDoc {
  const events: TranscriptEvent[] = []

  // Unanswered tool_use ids from the LATEST assistant turn, each mapped to its reason. Reset when a
  // NEW turn begins (keyed on message.id, not per row) and cleared by a tool_result. Claude Code
  // writes one assistant turn across several JSONL lines — one per content block — so a turn's
  // parallel tool_use blocks arrive on separate lines under the same id; resetting per row would
  // drop all but the last. An interrupted tool the user walked past lives under an earlier id and is
  // superseded by the next turn, so it never latches. A non-empty map at EOF means the tail is
  // blocked on the user. This mirrors the intent of parseTranscript's latch logic, with one
  // deliberate divergence: that one has no isSidechain guard, so a subagent's own turn clears the
  // parent's pending tool there; here the sidechain skip (below) leaves it intact, which is the more
  // correct read of "waiting on you".
  let pending = new Map<string, PendingReason>()
  let turn: string | undefined // message.id of the turn `pending` belongs to

  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let row: any
    try {
      row = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (row.isSidechain) continue // subagent-internal turn; not part of the main conversation

    const content = row.message?.content

    if (row.type === 'user') {
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b?.type === 'tool_result' && typeof b.tool_use_id === 'string') pending.delete(b.tool_use_id)
        }
      }
      if (row.isMeta) continue
      const raw = userText(content)
      if (raw) {
        const command = extractCommandName(raw)
        events.push({ kind: 'user', text: command || stripCommandEnvelope(raw).trim() })
      }
      continue
    }

    if (row.type === 'assistant') {
      // A new turn (new message.id) supersedes the last; only its own tools can still block. Lines
      // of the same turn keep accumulating into `pending`. An id-less row is treated as its own turn.
      const id = typeof row.message?.id === 'string' ? row.message.id : undefined
      if (id === undefined || id !== turn) {
        pending = new Map()
        turn = id
      }
      if (!Array.isArray(content)) continue
      for (const b of content) {
        if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          events.push({ kind: 'assistant', text: b.text })
        } else if (b?.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
          events.push({ kind: 'thinking', text: b.thinking })
        } else if (b?.type === 'tool_use' && typeof b.name === 'string') {
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

  // Surface the actual question when a turn blocks on several tools at once; else the first pending
  // tool in turn order. `.find` short-circuits, so no array is materialized in the common case.
  const reasons = pending.values()
  let pick: PendingReason | undefined
  for (const r of reasons) {
    if (!pick) pick = r
    if (r.question) {
      pick = r
      break
    }
  }
  return { events, waitingReason: pick?.reason ?? null }
}
