/** How to spawn a shell: the executable, its interactive argv, and its basename (the tab label). */
export interface ShellSpec {
  file: string;
  args: string[];
  name: string;
}

// Platform-independent basename: shell paths cross platforms in tests (a win32 path on a darwin
// host), and node:path.basename only splits the HOST's separator.
const baseName = (p: string): string =>
  p.split(/[\\/]/).filter(Boolean).pop() ?? p;

/** Interactive-flag spec for a POSIX shell (hermes posixShellSpec): zsh/bash get an interactive
 *  LOGIN shell so the user's full profile env loads; everything else plain interactive. */
function posixShellSpec(shellPath: string): ShellSpec {
  const name = baseName(shellPath);
  const args = name.includes("zsh") || name.includes("bash") ? ["-il"] : ["-i"];
  return { file: shellPath, args, name };
}

/** Spec for any resolved shell path, picking flags by family (hermes shellSpecFor): PowerShell
 *  drops its logo banner so the prompt sits flush like the POSIX shells; cmd needs nothing. */
export function shellSpecFor(shellPath: string): ShellSpec {
  const name = baseName(shellPath).toLowerCase();
  if (name.startsWith("pwsh") || name.startsWith("powershell")) {
    return { file: shellPath, args: ["-NoLogo"], name };
  }
  if (name.startsWith("cmd")) return { file: shellPath, args: [], name };
  return posixShellSpec(shellPath);
}

export interface ResolveShellDeps {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  /** Absolute path is an executable file. Injected (node:fs lives at the composition root). */
  isExecutable: (absPath: string) => boolean;
  /** Resolve a name on PATH (PATHEXT-aware on Windows); null when not found. Injected. */
  findOnPath: (name: string) => string | null;
}

/**
 * The interactive shell for the embedded terminal (hermes terminalShellCommand). An explicit
 * override wins: CBW_SHELL cross-platform, else $SHELL on POSIX only — on Windows $SHELL is
 * usually a stray MSYS/Git path node-pty can't spawn natively. Otherwise auto-detect: Windows
 * prefers pwsh → Windows PowerShell 5.1 → COMSPEC/cmd.exe; POSIX takes the first of
 * /bin/zsh → /bin/bash → /bin/sh.
 */
export function resolveShellCommand(deps: ResolveShellDeps): ShellSpec {
  const { env, platform } = deps;
  const isWin = platform === "win32";
  const override = (env.CBW_SHELL || (isWin ? "" : env.SHELL) || "").trim();
  if (override) {
    const resolved = deps.isExecutable(override)
      ? override
      : deps.findOnPath(override);
    if (resolved) return shellSpecFor(resolved);
  }
  if (isWin) {
    // Windows PowerShell 5.1 ships at a fixed System32 path on every Windows box; prefer it only
    // after PowerShell 7+ (pwsh).
    const systemRoot = env.SystemRoot || env.windir || "C:\\Windows";
    const builtin = `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    const command =
      deps.findOnPath("pwsh.exe") ??
      deps.findOnPath("pwsh") ??
      (deps.isExecutable(builtin)
        ? builtin
        : deps.findOnPath("powershell.exe")) ??
      env.COMSPEC ??
      "cmd.exe";
    return shellSpecFor(command);
  }
  const found = ["/bin/zsh", "/bin/bash", "/bin/sh"].find((c) =>
    deps.isExecutable(c),
  );
  return posixShellSpec(found ?? "/bin/sh");
}

/**
 * Lenient cwd for a shell (hermes safeTerminalCwd): a file becomes its parent dir, anything
 * missing/invalid becomes home. Deliberately unlike the Managed path's hard cwd error — a claude
 * session's cwd anchors its Transcript, a shell's doesn't.
 */
export function safeShellCwd(opts: {
  requested: string | undefined;
  home: string;
  stat: (p: string) => "dir" | "file" | null;
  /** Path ops, injected so the function stays pure and the platform's semantics are explicit — the
   *  composition root passes node:path's (platform) resolve/dirname; tests pass node:path.posix's so
   *  their expectations are deterministic across OSes (a bare node:path.resolve("/x") is "/x" on
   *  POSIX but "C:\x" on Windows). */
  resolve: (p: string) => string;
  dirname: (p: string) => string;
}): string {
  const candidate = opts.resolve(String(opts.requested || opts.home));
  const kind = opts.stat(candidate);
  if (kind === "dir") return candidate;
  if (kind === "file") return opts.dirname(candidate);
  return opts.home;
}

/**
 * The child env for a user shell (hermes terminalShellEnv): strip npm's managed prefix and
 * package vars (Electron is often launched via `pnpm dev`; nvm/proto warn loudly on the leak),
 * strip color/theme-detection overrides that ride along from non-tty launchers, then declare what
 * this pty really is — a truecolor xterm-256color owned by FlightDeck.
 */
export function buildShellEnv(opts: {
  baseEnv: NodeJS.ProcessEnv;
  appVersion: string;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...opts.baseEnv };
  for (const key of Object.keys(env)) {
    if (
      key === "npm_config_prefix" ||
      key.startsWith("npm_config_") ||
      key.startsWith("npm_package_")
    ) {
      delete env[key];
    }
  }
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  delete env.COLORFGBG;
  env.COLORTERM = "truecolor";
  env.LC_CTYPE = env.LC_CTYPE || "UTF-8";
  env.TERM = "xterm-256color";
  env.TERM_PROGRAM = "FlightDeck";
  env.TERM_PROGRAM_VERSION = opts.appVersion;
  return env;
}
