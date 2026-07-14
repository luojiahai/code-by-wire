import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";

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

/**
 * Whether spawned-session env should override PATH. PATH correction is a macOS-only fix: a
 * Finder-launched .app inherits launchd's bare PATH, so the packaged mac build recovers the login-shell
 * PATH (see resolveShellPath). Off darwin the inherited PATH is already correct — and on Windows the real
 * env key is `Path`, so adding a `PATH` key (what the footer terminal's shellTermEnv does when
 * correctedPath is non-null) would leave the child env carrying both `Path` and `PATH`, a
 * case-insensitive collision. Returning false here keeps that from happening. Pure + tested.
 */
export function shouldCorrectPath(
  platform: NodeJS.Platform,
  isPackaged: boolean,
): boolean {
  return platform === "darwin" && isPackaged;
}

const FIELD = "__CBW_FIELD__";

/** Budget for the one-shot login-shell env probe. Heavy rc files (nvm/conda/pyenv/oh-my-zsh) can take a
 *  few seconds to source, so allow 5s before giving up; a wedged shell still can't stall startup past
 *  that. On timeout the probe returns null and the caller falls back to the well-known dirs. */
const SHELL_PROBE_TIMEOUT_MS = 5_000;

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
 *  (spawns a real shell). */
export function probeShellEnv(shell: string): ShellEnv | null {
  // Own session, no controlling terminal: the -i shell would otherwise enable job control and
  // seize the launching terminal's foreground process group, permanently eating that terminal's
  // Ctrl+C if the probe is interrupted (see cli-check.ts's createProbeExec for the full story).
  // Only reachable when the packaged binary is launched FROM a terminal — Finder launches carry
  // no controlling tty — but the flag costs nothing. `detached` on the SYNC spawn is real but
  // undocumented: the implementation shares async spawn's option normalization and forwards it to
  // the same libuv flag (verified on Node 24), while the docs and @types/node list it only for
  // async spawn — hence the widened option type. If Node ever aligns the sync implementation with
  // its docs the flag would drop silently, so re-verify with a pty harness on major Node upgrades.
  const opts: SpawnSyncOptionsWithStringEncoding & { detached: boolean } = {
    encoding: "utf8",
    timeout: SHELL_PROBE_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "ignore"],
    detached: true,
    env: {
      ...process.env,
      TERM: "dumb",
      DISABLE_AUTO_UPDATE: "true",
      GIT_TERMINAL_PROMPT: "0",
    },
  };
  const r = spawnSync(shell, ["-ilc", SHELL_ENV_SCRIPT], opts);
  // Same nulls execFileSync's throw/catch produced here before: a spawn failure (error), the
  // timeout's kill (signal), or a nonzero shell exit (status) all mean no usable env.
  if (r.error || r.signal || r.status !== 0) return null;
  return parseShellEnv(r.stdout);
}
