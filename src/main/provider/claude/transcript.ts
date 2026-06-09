import { basename } from 'node:path'
import { normalizeModelId, type ModelId } from '@shared/models'

export interface TranscriptSummary {
  title: string
  project: string
  cwd: string
  branch?: string
  model: ModelId
  lastActivityMs: number
}

// A slash-command user turn is a bundle of these envelope tags; its useful label
// is the command name, so we surface that and drop the rest. Everything outside
// this known set is left alone, so prose keeps its angle brackets (a < b, JSX,
// generics) instead of being shredded by a blanket tag strip.
const COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/
const COMMAND_ENVELOPE =
  /<(command-name|command-message|command-args|command-contents|local-command-stdout|local-command-stderr)>[\s\S]*?<\/\1>/g

/** First non-empty user prompt (slash commands shown by name), else the project basename. */
export function deriveTitle(userPrompts: string[], cwd: string): string {
  for (const raw of userPrompts) {
    const command = raw.match(COMMAND_NAME)?.[1]?.trim()
    const cleaned = command || raw.replace(COMMAND_ENVELOPE, '').replace(/\s+/g, ' ').trim()
    if (cleaned) return cleaned.length > 80 ? cleaned.slice(0, 79) + '…' : cleaned
  }
  return basename(cwd) || 'session'
}

/**
 * Reduce a transcript's JSONL into a normalized summary. Parses line by line and
 * skips any unparseable line, so a transcript being appended to right now (a
 * half-written trailing line) is fine.
 */
export function parseTranscript(jsonl: string, fallbackCwd = ''): TranscriptSummary {
  let cwd = fallbackCwd
  let branch: string | undefined
  let lastModelRaw: string | undefined
  let lastActivityMs = 0
  const userPrompts: string[] = []

  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let row: any
    try {
      row = JSON.parse(trimmed)
    } catch {
      continue
    }

    if (typeof row.cwd === 'string') cwd = row.cwd
    if (typeof row.gitBranch === 'string') branch = row.gitBranch

    if (typeof row.timestamp === 'string') {
      const ms = Date.parse(row.timestamp)
      if (!Number.isNaN(ms) && ms > lastActivityMs) lastActivityMs = ms
    }

    if (row.type === 'assistant' && typeof row.message?.model === 'string') {
      lastModelRaw = row.message.model
    }

    if (row.type === 'user' && !row.isMeta && typeof row.message?.content === 'string') {
      userPrompts.push(row.message.content)
    }
  }

  return {
    title: deriveTitle(userPrompts, cwd),
    project: basename(cwd) || 'unknown',
    cwd,
    branch,
    model: normalizeModelId(lastModelRaw),
    lastActivityMs,
  }
}
