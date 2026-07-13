import type { ModelSelection } from "@shared/models";
import { resolvePosixLoginCommand, type PosixShellDeps } from "./shell-command";
import { quoteShellArg } from "./shell-quote";

export interface ClaudeCommand {
  file: string;
  args: string[];
}

/**
 * Argv to spawn a fresh Managed session: `claude` pinned to `id` (so the app can correlate the process
 * to its Transcript at `projects/<cwd-slug>/<id>.jsonl`) on `model`. The `--model` flag is the family
 * alias (`opus`/`sonnet`/`haiku`/`fable`) the picker chose — an alias, not a dated string, so it keeps
 * working as versions roll; the session's real model is re-derived from the transcript. `"default"`
 * omits `--model` entirely rather than passing the literal alias, so the CLI's own configured default
 * applies exactly as if the flag were never given. Always the bare `"claude"` command — which binary
 * that resolves to is the spawning shell's job (see toSpawnForm), not this app's. cwd and env are spawn
 * options, not argv, so this stays a pure function of its inputs.
 */
export function buildClaudeCommand(opts: {
  id: string;
  model: ModelSelection;
}): ClaudeCommand {
  return {
    file: "claude",
    args: [
      "--session-id",
      opts.id,
      ...(opts.model === "default" ? [] : ["--model", opts.model]),
    ],
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
  // A bare command name like `claude` (no directory separator, no extension) — always the case now that
  // there's no resolved absolute bin. It must be resolved on PATH through PATHEXT, which CreateProcess
  // does NOT do: it only appends `.exe`, so it never finds the `claude.cmd`/`.ps1` npm shim and the
  // session dies with a bare "[process exited]". Route it through cmd.exe, which resolves PATHEXT,
  // exactly as a plain `claude` typed at a Windows prompt would.
  if (!/[\\/]/.test(cmd.file) && !/\.[^.]+$/.test(cmd.file)) {
    return { file: "cmd.exe", args: ["/c", cmd.file, ...cmd.args] };
  }
  return cmd;
}

/**
 * Wrap a claude invocation in the user's login+interactive shell (`<shell> -ilc "claude ..."`), so a
 * Managed session resolves PATH, CLAUDE_CONFIG_DIR, and everything else the user's rc files set exactly
 * the way a plain terminal does — by actually sourcing them, instead of the app recovering and pinning
 * individual vars. Every token (including `claude` itself) is single-quoted, so app-generated values
 * (session UUIDs, model aliases) can never be misparsed as shell syntax.
 */
export function wrapInLoginShell(
  cmd: ClaudeCommand,
  deps: PosixShellDeps,
): ClaudeCommand {
  const commandLine = [cmd.file, ...cmd.args].map(quoteShellArg).join(" ");
  const spec = resolvePosixLoginCommand(deps, commandLine);
  return { file: spec.file, args: spec.args };
}

/**
 * The single place that decides how a logical claude invocation actually gets spawned on this
 * platform: the existing Windows PATHEXT shim on win32, or a login-shell wrap everywhere else. Used by
 * both Managed session spawn/adopt/fork (manager.ts) and the CLI status probes (cli-check.ts), so both
 * resolve `claude` identically. `posixShell` is required on non-win32 platforms — a missing dep there
 * is a composition-root wiring bug, not a runtime condition to degrade gracefully from.
 */
export function toSpawnForm(
  cmd: ClaudeCommand,
  platform: NodeJS.Platform,
  posixShell?: PosixShellDeps,
): ClaudeCommand {
  if (platform === "win32") return launchForm(cmd, platform);
  if (!posixShell) {
    throw new Error(
      "toSpawnForm: posixShell deps are required to spawn on a non-win32 platform",
    );
  }
  return wrapInLoginShell(cmd, posixShell);
}

/**
 * Argv to Adopt an Ended session: `claude --resume <id>` under the session's OWN id, so the CLI keeps
 * writing the same Transcript at `projects/<cwd-slug>/<id>.jsonl`. No `--model`: `--resume` restores the
 * session's model ("model settings still apply"), which is the "inherit" in one-click Adopt.
 */
export function buildResumeCommand(opts: { id: string }): ClaudeCommand {
  return {
    file: "claude",
    args: ["--resume", opts.id],
  };
}

/**
 * Argv to Fork a session: `claude --resume <sourceId> --session-id <newId> --fork-session` resumes the
 * source conversation but writes it under a NEW id, so the original Transcript at
 * `projects/<cwd-slug>/<sourceId>.jsonl` is left untouched and the fork records its own
 * `projects/<cwd-slug>/<newId>.jsonl`. The pre-assigned `--session-id` is honored alongside
 * `--fork-session` (verified), so the app pins the fork's id up front exactly like a fresh spawn. No
 * `--model`: the fork restores the source's model — the same "inherit" as Adopt.
 */
export function buildForkCommand(opts: {
  sourceId: string;
  newId: string;
}): ClaudeCommand {
  return {
    file: "claude",
    args: [
      "--resume",
      opts.sourceId,
      "--session-id",
      opts.newId,
      "--fork-session",
    ],
  };
}
