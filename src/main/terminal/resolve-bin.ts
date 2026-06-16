import { accessSync, constants, statSync } from "node:fs";

/**
 * Pre-flight resolution for the `claude` executable. node-pty's exec failure (binary not on PATH, bad
 * `CBW_CLAUDE_BIN` override) surfaces only as a non-zero exit — indistinguishable from claude starting
 * and erroring — so the user just sees "[process exited (1)]". Resolving the binary ourselves the way
 * an OS exec would lets the terminal manager turn a not-found into an actionable message instead.
 *
 * Path handling is driven by an explicit `platform` (not host `node:path`) so the same logic is unit-
 * tested for both POSIX and Windows from one machine.
 */

export interface ResolveExecutableDeps {
  /** The command to find — a bare name resolved against PATH, or an explicit path checked directly. */
  file: string;
  /** The PATH string the child will be spawned with (`:`/`;`-joined). */
  path: string;
  platform: NodeJS.Platform;
  /** Windows PATHEXT; ignored off Windows. */
  pathExt?: string;
  /** True if `p` exists and is an executable file. Injected so resolution is unit-tested without a real
   *  filesystem. */
  isExecutable: (p: string) => boolean;
}

const pathDelimiter = (platform: NodeJS.Platform): string =>
  platform === "win32" ? ";" : ":";

const pathSep = (platform: NodeJS.Platform): string =>
  platform === "win32" ? "\\" : "/";

/** A name carrying a directory separator (or a Windows drive prefix) is a path, looked up directly. */
function isExplicitPath(file: string, platform: NodeJS.Platform): boolean {
  if (/[\\/]/.test(file)) return true;
  return platform === "win32" && /^[a-zA-Z]:/.test(file);
}

/**
 * Resolve `file` to an executable the way an OS exec would: an explicit path is checked as-is; a bare
 * name is searched across each PATH entry. On Windows each candidate is also tried with every PATHEXT
 * suffix. Returns the first hit, or null when nothing executable is found.
 */
export function resolveExecutable(d: ResolveExecutableDeps): string | null {
  const suffixes =
    d.platform === "win32"
      ? ["", ...(d.pathExt ?? ".COM;.EXE;.BAT;.CMD").split(";")].filter(
          (s, i, a) => a.indexOf(s) === i,
        )
      : [""];
  const firstHit = (base: string): string | null =>
    suffixes.map((s) => base + s).find(d.isExecutable) ?? null;

  if (isExplicitPath(d.file, d.platform)) return firstHit(d.file);
  const sep = pathSep(d.platform);
  for (const dir of d.path.split(pathDelimiter(d.platform))) {
    if (!dir) continue;
    const hit = firstHit(dir.replace(/[\\/]+$/, "") + sep + d.file);
    if (hit) return hit;
  }
  return null;
}

/** Real fs probe: an existing regular file with the execute bit (X_OK is a no-op gate on Windows). */
function isExecutableFile(p: string): boolean {
  try {
    if (!statSync(p).isFile()) return false;
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Production wiring: resolve `file` against `path` using the live platform and filesystem. */
export function resolveClaudeBin(file: string, path: string): string | null {
  return resolveExecutable({
    file,
    path,
    platform: process.platform,
    pathExt: process.env.PATHEXT,
    isExecutable: isExecutableFile,
  });
}

const NL = "\r\n";
const RED = "\x1b[1;31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

/**
 * The terminal message shown in place of a bare "[process exited (1)]" when `claude` can't be found.
 * Names whether the miss was a bad explicit override or a PATH miss, shows where we looked, and gives
 * the two fixes (install it / point CBW_CLAUDE_BIN at it). Styled to match the dim exit line's ANSI.
 */
export function binNotFoundMessage(file: string, path: string): string {
  const header = `${NL}${RED}Could not start Claude Code${RESET}${NL}`;
  if (isExplicitPath(file, process.platform)) {
    return (
      header +
      `No executable was found at CBW_CLAUDE_BIN:${NL}  ${file}${NL}${NL}` +
      `Point CBW_CLAUDE_BIN at the real \`claude\` binary (\`which claude\`), or unset it to search PATH.${NL}`
    );
  }
  const dirs = path.split(pathDelimiter(process.platform)).filter(Boolean);
  const searched = dirs.length
    ? `Searched these PATH locations:${NL}${dirs.map((dir) => `  ${dir}`).join(NL)}${NL}${NL}`
    : `Your PATH was empty.${NL}${NL}`;
  return (
    header +
    `The \`claude\` command isn't on the PATH this app was launched with.${NL}${NL}` +
    searched +
    `To fix this:${NL}` +
    `  • Confirm \`which claude\` works in your terminal, and that Claude Code is installed.${NL}` +
    `  • If it's installed, set CBW_CLAUDE_BIN to its full path and relaunch.${NL}`
  );
}

/**
 * Hint appended when a session that did start dies right away with a non-zero code. The most common
 * cause is an out-of-date Claude Code that doesn't understand the app's flags (e.g. `--session-id`),
 * which `claude` rejects with a usage error and exits 1. That error is already on screen above this;
 * the hint frames it and points at the fix rather than letting it read as a mysterious "[process
 * exited (1)]". Yellow (a warning), not the red of a hard launch failure.
 */
export function fastExitMessage(code: number): string {
  return (
    `${NL}${YELLOW}Claude Code exited right after starting (code ${code}).${RESET}${NL}` +
    `If you didn't quit it yourself, the installed Claude Code may be out of date — update it ` +
    `(e.g. \`claude update\`), then check the output above for the exact error.${NL}`
  );
}

/** Shown when node-pty itself throws at spawn (a vanished cwd, a native error). */
export function spawnFailedMessage(file: string, err: unknown): string {
  const reason = err instanceof Error ? err.message : String(err);
  return `${NL}${RED}Could not start Claude Code${RESET}${NL}Failed to launch \`${file}\`: ${reason}${NL}`;
}
