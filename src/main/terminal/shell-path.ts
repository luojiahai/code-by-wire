import { execFileSync, spawn } from "node:child_process";
import { homedir } from "node:os";

/**
 * A macOS .app launched from Finder/Spotlight/Dock inherits launchd's bare PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin`), NOT the user's shell PATH. So `claude` — installed under
 * `~/.local/bin` by the official installer, or via homebrew/npm/nvm/mise — isn't on PATH, node-pty's
 * exec fails with ENOENT, and a Managed session dies the instant it spawns ("[process exited]"). Under
 * `pnpm dev` the dev shell's PATH is inherited, which is why the bug never shows there.
 *
 * The fix is to recover the PATH the user's own terminal sees: run their login+interactive shell once
 * and read back its PATH (this picks up nvm/mise/asdf/fnm/homebrew with zero per-tool knowledge), then
 * union it with a few well-known install dirs as a backstop. The merge/dedupe is a pure function of its
 * inputs with the shell `probe` injected, so it's unit-tested without spawning a real shell.
 */

/** Standard locations a `claude` binary lands in, appended as a backstop if the shell probe comes up
 *  empty. `~/.local/bin` is the official installer's target; the homebrew dirs cover arm64 and intel. */
function fallbackDirs(home: string): string[] {
  return [`${home}/.local/bin`, "/opt/homebrew/bin", "/usr/local/bin"];
}

export interface ResolvePathDeps {
  platform: NodeJS.Platform;
  /** The user's login shell (`process.env.SHELL`); defaults to zsh, the macOS default, when unset. */
  shell: string | undefined;
  home: string;
  /** The PATH the app process was launched with (`process.env.PATH`). */
  currentPath: string | undefined;
  /** Returns the login shell's PATH, or null if the shell is missing, hangs, or prints nothing usable. */
  probe: (shell: string) => string | null;
}

/**
 * The corrected PATH for spawned `claude` sessions: the login-shell PATH first (highest priority),
 * then the launched-with PATH, then the well-known fallback dirs, deduped with each dir kept at its
 * first occurrence. Off macOS the launchd-PATH problem doesn't exist, so PATH is returned untouched.
 */
export function resolveShellPath(deps: ResolvePathDeps): string {
  if (deps.platform !== "darwin") return deps.currentPath ?? "";
  const probed = deps.probe(deps.shell || "/bin/zsh");
  const segments = [probed, deps.currentPath]
    .flatMap((p) => (p ? p.split(":") : []))
    .concat(fallbackDirs(deps.home));
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const seg of segments) {
    if (!seg || seen.has(seg)) continue;
    seen.add(seg);
    deduped.push(seg);
  }
  return deduped.join(":");
}

const DELIM = "__CBW_PATH_DELIM__";

/** Pull the fenced PATH out of the probe's stdout. The value sits between two delimiters so an rc-file
 *  banner the interactive shell prints (before or after it) can't be mistaken for PATH. Exported so the
 *  parse is unit-tested without spawning a real shell. Returns null when the fence or value is missing. */
export function parseProbedPath(out: string): string | null {
  const start = out.indexOf(DELIM);
  const end = out.indexOf(DELIM, start + DELIM.length);
  if (start === -1 || end === -1) return null;
  return out.slice(start + DELIM.length, end).trim() || null;
}

/** Run the login+interactive shell and print just its PATH, fenced by delimiters. `printenv PATH` reads
 *  the colon-joined env var directly, so it's right for every shell (fish stores PATH as a list that
 *  `"$PATH"` would join with spaces, not colons). A short timeout keeps a wedged shell from stalling the
 *  first spawn; any failure returns null so the caller falls back to the well-known dirs. */
function probeLoginShell(shell: string): string | null {
  try {
    const out = execFileSync(
      shell,
      ["-ilc", `printf %s "${DELIM}"; printenv PATH; printf %s "${DELIM}"`],
      {
        encoding: "utf8",
        timeout: 5_000,
        stdio: ["ignore", "pipe", "ignore"],
        env: {
          ...process.env,
          TERM: "dumb",
          DISABLE_AUTO_UPDATE: "true",
          GIT_TERMINAL_PROMPT: "0",
        },
      },
    );
    return parseProbedPath(out);
  } catch {
    return null;
  }
}

/** Real-world wiring: resolve the child PATH from the live process and a one-shot login-shell probe. */
export function shellPath(): string {
  return resolveShellPath({
    platform: process.platform,
    shell: process.env.SHELL,
    home: homedir(),
    currentPath: process.env.PATH,
    probe: probeLoginShell,
  });
}

const FIELD = "__CBW_FIELD__";

export interface ShellEnv {
  path: string | null;
  configDir: string | null;
  claudePath: string | null;
  duplicates: string[];
}

/** Prints PATH, CLAUDE_CONFIG_DIR, and every `claude` on PATH, fenced by FIELD delimiters so an rc
 *  banner can't be mistaken for a value. `command -v -a` lists duplicates; the first is the one a
 *  shell would run. */
export const SHELL_ENV_SCRIPT =
  `printf %s "${FIELD}"; printenv PATH; ` +
  `printf %s "${FIELD}"; printf %s "$CLAUDE_CONFIG_DIR"; ` +
  `printf %s "${FIELD}"; command -v -a claude 2>/dev/null; ` +
  `printf %s "${FIELD}"`;

/** Parse the four fenced fields. Returns null when the fence is absent (shell errored before running). */
export function parseShellEnv(out: string): ShellEnv | null {
  const parts = out.split(FIELD);
  // Expect: [banner, PATH, CONFIG_DIR, claude-list, trailing]
  if (parts.length < 5) return null;
  const path = parts[1].trim() || null;
  const configDir = parts[2].trim() || null;
  const list = parts[3]
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    path,
    configDir,
    claudePath: list[0] ?? null,
    duplicates: list,
  };
}

/** Real wiring: run the login+interactive shell once and parse its env. Null on any failure. Untested
 *  (spawns a real shell), like probeLoginShell. */
export function probeShellEnv(shell: string): ShellEnv | null {
  try {
    const out = execFileSync(shell, ["-ilc", SHELL_ENV_SCRIPT], {
      encoding: "utf8",
      timeout: 3_000,
      stdio: ["ignore", "pipe", "ignore"],
      env: {
        ...process.env,
        TERM: "dumb",
        DISABLE_AUTO_UPDATE: "true",
        GIT_TERMINAL_PROMPT: "0",
      },
    });
    return parseShellEnv(out);
  } catch {
    return null;
  }
}

/** Async sibling of probeShellEnv: the same one-shot login-shell env probe, but non-blocking so a
 *  user-triggered re-check doesn't freeze the main process. Uses `spawn` (not execFile) so it can apply the
 *  same stdio discipline as the sync probe — ignore stdin and DISCARD the child's stderr. execFile has no
 *  stdio option and would buffer a chatty login rc's stderr into its (1 MB) maxBuffer, rejecting the whole
 *  probe → a spurious notFound. Null on any failure or the 3s timeout. Untested (spawns a real shell). */
export function probeShellEnvAsync(shell: string): Promise<ShellEnv | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: ShellEnv | null): void => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    try {
      const child = spawn(shell, ["-ilc", SHELL_ENV_SCRIPT], {
        stdio: ["ignore", "pipe", "ignore"],
        env: {
          ...process.env,
          TERM: "dumb",
          DISABLE_AUTO_UPDATE: "true",
          GIT_TERMINAL_PROMPT: "0",
        },
      });
      const timer = setTimeout(() => {
        child.kill();
        done(null);
      }, 3_000);
      let out = "";
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        out += chunk;
      });
      child.on("error", () => {
        clearTimeout(timer);
        done(null);
      });
      child.on("close", () => {
        clearTimeout(timer);
        done(parseShellEnv(out));
      });
    } catch {
      done(null);
    }
  });
}
