import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

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
  return [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin']
}

export interface ResolvePathDeps {
  platform: NodeJS.Platform
  /** The user's login shell (`process.env.SHELL`); defaults to zsh, the macOS default, when unset. */
  shell: string | undefined
  home: string
  /** The PATH the app process was launched with (`process.env.PATH`). */
  currentPath: string | undefined
  /** Returns the login shell's PATH, or null if the shell is missing, hangs, or prints nothing usable. */
  probe: (shell: string) => string | null
}

/**
 * The corrected PATH for spawned `claude` sessions: the login-shell PATH first (highest priority),
 * then the launched-with PATH, then the well-known fallback dirs, deduped with each dir kept at its
 * first occurrence. Off macOS the launchd-PATH problem doesn't exist, so PATH is returned untouched.
 */
export function resolveShellPath(deps: ResolvePathDeps): string {
  if (deps.platform !== 'darwin') return deps.currentPath ?? ''
  const probed = deps.probe(deps.shell || '/bin/zsh')
  const segments = [probed, deps.currentPath].flatMap((p) => (p ? p.split(':') : [])).concat(fallbackDirs(deps.home))
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const seg of segments) {
    if (!seg || seen.has(seg)) continue
    seen.add(seg)
    deduped.push(seg)
  }
  return deduped.join(':')
}

const DELIM = '__CBW_PATH_DELIM__'

/** Pull the fenced PATH out of the probe's stdout. The value sits between two delimiters so an rc-file
 *  banner the interactive shell prints (before or after it) can't be mistaken for PATH. Exported so the
 *  parse is unit-tested without spawning a real shell. Returns null when the fence or value is missing. */
export function parseProbedPath(out: string): string | null {
  const start = out.indexOf(DELIM)
  const end = out.indexOf(DELIM, start + DELIM.length)
  if (start === -1 || end === -1) return null
  return out.slice(start + DELIM.length, end).trim() || null
}

/** Run the login+interactive shell and print just its PATH, fenced by delimiters. `printenv PATH` reads
 *  the colon-joined env var directly, so it's right for every shell (fish stores PATH as a list that
 *  `"$PATH"` would join with spaces, not colons). A short timeout keeps a wedged shell from stalling the
 *  first spawn; any failure returns null so the caller falls back to the well-known dirs. */
function probeLoginShell(shell: string): string | null {
  try {
    const out = execFileSync(shell, ['-ilc', `printf %s "${DELIM}"; printenv PATH; printf %s "${DELIM}"`], {
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, TERM: 'dumb', DISABLE_AUTO_UPDATE: 'true', GIT_TERMINAL_PROMPT: '0' },
    })
    return parseProbedPath(out)
  } catch {
    return null
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
  })
}
