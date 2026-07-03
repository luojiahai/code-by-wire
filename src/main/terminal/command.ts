import type { ModelSelection } from "@shared/models";

export interface ClaudeCommand {
  file: string;
  args: string[];
}

/**
 * Argv to spawn a fresh Managed session: `claude` pinned to `id` (so the app can correlate the process
 * to its Transcript at `projects/<cwd-slug>/<id>.jsonl`) on `model`. The `--model` flag is the family
 * alias (`opus`/`sonnet`/`haiku`/`fable`) the picker chose — an alias, not a dated string, so it keeps
 * working as versions roll; the session's real model is re-derived from the transcript. The executable
 * is the `CBW_CLAUDE_BIN` override else `claude` on PATH, resolved by node-pty. cwd and env are spawn
 * options, not argv, so this stays a pure function of its inputs.
 */
export function buildClaudeCommand(opts: {
  id: string;
  model: ModelSelection;
  bin?: string;
}): ClaudeCommand {
  return {
    file: opts.bin ?? process.env.CBW_CLAUDE_BIN ?? "claude",
    args: ["--session-id", opts.id, "--model", opts.model],
  };
}

/** Rewrite a Windows shim invocation into a launch form node-pty's ConPTY backend can run. A real `.exe`
 *  is launched directly; a `.cmd`/`.bat` goes through `cmd.exe /c` and a `.ps1` through PowerShell, because
 *  CreateProcess only runs PE executables. POSIX is always pass-through. Form confirmed by the PR3 spike. */
export function launchForm(
  cmd: ClaudeCommand,
  platform: NodeJS.Platform,
): ClaudeCommand {
  if (platform !== "win32") return cmd;
  if (/\.(cmd|bat)$/i.test(cmd.file)) {
    return { file: "cmd.exe", args: ["/c", cmd.file, ...cmd.args] };
  }
  if (/\.ps1$/i.test(cmd.file)) {
    return {
      file: "powershell.exe",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        cmd.file,
        ...cmd.args,
      ],
    };
  }
  // A bare command name like `claude` (no directory separator, no extension) — the fallback when no
  // absolute bin was resolved yet (the pending CLI check, or a bare CBW_CLAUDE_BIN). It must be resolved
  // on PATH through PATHEXT, which CreateProcess does NOT do: it only appends `.exe`, so it never finds
  // the `claude.cmd`/`.ps1` npm shim and the session dies with a bare "[process exited]". Route it through
  // cmd.exe, which resolves PATHEXT, exactly as the resolved-`.cmd` path does. A resolved absolute path
  // (which always carries its extension) is left to launch directly.
  if (!/[\\/]/.test(cmd.file) && !/\.[^.]+$/.test(cmd.file)) {
    return { file: "cmd.exe", args: ["/c", cmd.file, ...cmd.args] };
  }
  return cmd;
}

/**
 * Argv to Adopt an Ended session: `claude --resume <id>` under the session's OWN id, so the CLI keeps
 * writing the same Transcript at `projects/<cwd-slug>/<id>.jsonl`. No `--model`: `--resume` restores the
 * session's model ("model settings still apply"), which is the "inherit" in one-click Adopt. Same bin
 * resolution as buildClaudeCommand.
 */
export function buildResumeCommand(opts: {
  id: string;
  bin?: string;
}): ClaudeCommand {
  return {
    file: opts.bin ?? process.env.CBW_CLAUDE_BIN ?? "claude",
    args: ["--resume", opts.id],
  };
}

/**
 * Argv to Fork a session: `claude --resume <sourceId> --session-id <newId> --fork-session` resumes the
 * source conversation but writes it under a NEW id, so the original Transcript at
 * `projects/<cwd-slug>/<sourceId>.jsonl` is left untouched and the fork records its own
 * `projects/<cwd-slug>/<newId>.jsonl`. The pre-assigned `--session-id` is honored alongside
 * `--fork-session` (verified), so the app pins the fork's id up front exactly like a fresh spawn. No
 * `--model`: the fork restores the source's model — the same "inherit" as Adopt. Same bin resolution as
 * buildClaudeCommand.
 */
export function buildForkCommand(opts: {
  sourceId: string;
  newId: string;
  bin?: string;
}): ClaudeCommand {
  return {
    file: opts.bin ?? process.env.CBW_CLAUDE_BIN ?? "claude",
    args: [
      "--resume",
      opts.sourceId,
      "--session-id",
      opts.newId,
      "--fork-session",
    ],
  };
}
