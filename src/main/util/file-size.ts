import { statSync } from "node:fs";

/**
 * The largest file any main-process reader will turn into a string. V8 refuses to build a string
 * longer than 0x1fffffe8 chars, and a utf8 read yields at most one char per byte, so a file past
 * this many bytes cannot become a string.
 *
 * The failure is not recoverable after the fact, which is why every whole-file reader checks the
 * size BEFORE reading rather than catching afterwards. Plain Node reports the overflow as a
 * catchable ERR_STRING_TOO_LONG, but inside Electron's main process the same overflow is a hard
 * process abort (EXC_BREAKPOINT/SIGTRAP) that no try/catch can intercept — and release Electron
 * compiles the CHECK to a bare trap with no message, so the app dies silently with nothing on
 * stderr. A 1.4GB Codex rollout killed the app ~2.5s into launch this way.
 */
export const MAX_TEXT_FILE_BYTES = 0x1fffffe8;

/**
 * Whether reading `path` whole could overflow V8's string cap. A file that vanished or can't be
 * stat'd is not "oversized": the caller's own read then fails and takes its existing error path.
 */
export function isOversizedTextFile(
  path: string,
  maxBytes: number = MAX_TEXT_FILE_BYTES,
): boolean {
  try {
    return statSync(path).size > maxBytes;
  } catch {
    return false;
  }
}
