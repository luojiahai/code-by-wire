import { randomUUID } from 'node:crypto'
import type { ModelId } from '@shared/models'

/** Our canonical model ids → the stable `claude --model` aliases. Aliases (not dated model strings)
 *  so the flag keeps working as model versions roll; the session's real model is re-derived from its
 *  transcript by the provider anyway, so an alias never lies in the UI. */
const MODEL_CLI_ALIAS: Record<ModelId, string> = {
  'claude-opus-4-8': 'opus',
  'claude-sonnet-4-6': 'sonnet',
  'claude-haiku-4-5': 'haiku',
}

export interface ClaudeCommand {
  file: string
  args: string[]
}

/**
 * Argv to spawn a fresh Managed session: `claude` pinned to `id` (so the app can correlate the process
 * to its Transcript at `projects/<cwd-slug>/<id>.jsonl`) on `model`. The executable is the
 * `CBW_CLAUDE_BIN` override else `claude` on PATH, resolved by node-pty. cwd and env are spawn options,
 * not argv, so this stays a pure function of its inputs.
 */
export function buildClaudeCommand(opts: { id: string; model: ModelId; bin?: string }): ClaudeCommand {
  return {
    file: opts.bin ?? process.env.CBW_CLAUDE_BIN ?? 'claude',
    args: ['--session-id', opts.id, '--model', MODEL_CLI_ALIAS[opts.model]],
  }
}

/** A fresh pinned session id (uuid v4) — the id the app correlates to the session's Transcript. */
export function newSessionId(): string {
  return randomUUID()
}
