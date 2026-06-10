import { familyFor, type ModelId } from '@shared/models'

export interface ClaudeCommand {
  file: string
  args: string[]
}

/**
 * Argv to spawn a fresh Managed session: `claude` pinned to `id` (so the app can correlate the process
 * to its Transcript at `projects/<cwd-slug>/<id>.jsonl`) on `model`. The CLI alias is the model's
 * family name (`opus`/`sonnet`/`haiku`) straight from the MODELS table — an alias, not a dated string,
 * so the flag keeps working as versions roll, and the session's real model is re-derived from the
 * transcript anyway. The executable is the `CBW_CLAUDE_BIN` override else `claude` on PATH, resolved by
 * node-pty. cwd and env are spawn options, not argv, so this stays a pure function of its inputs.
 */
export function buildClaudeCommand(opts: { id: string; model: ModelId; bin?: string }): ClaudeCommand {
  return {
    file: opts.bin ?? process.env.CBW_CLAUDE_BIN ?? 'claude',
    args: ['--session-id', opts.id, '--model', familyFor(opts.model)],
  }
}

/**
 * Argv to Adopt an Ended session: `claude --resume <id>` under the session's OWN id, so the CLI keeps
 * writing the same Transcript at `projects/<cwd-slug>/<id>.jsonl`. No `--model`: `--resume` restores the
 * session's model ("model settings still apply"), which is the "inherit" in one-click Adopt. Same bin
 * resolution as buildClaudeCommand.
 */
export function buildResumeCommand(opts: { id: string; bin?: string }): ClaudeCommand {
  return {
    file: opts.bin ?? process.env.CBW_CLAUDE_BIN ?? 'claude',
    args: ['--resume', opts.id],
  }
}
