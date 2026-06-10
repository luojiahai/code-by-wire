export interface WrapperSpec {
  /** Our app dir (`<claudeDir>/.code-by-wire`); captures go in its `statusline/` subdir. Absolute. */
  appDir: string
  /** The user's original statusLine command to call through to, or null when there was none. */
  wrappedCommand: string | null
}

/**
 * The POSIX-sh source of the statusLine wrapper the installed statusLine points at. It captures
 * Claude Code's JSON (piped on stdin) to a per-Session side-channel file, then calls through to the
 * user's original statusLine so their prompt still renders. It can never block or fail the prompt:
 * every capture step is best-effort (`2>/dev/null`) and `exit 0` swallows a faulty wrapped command's
 * status (ADR-0001 — a blank statusLine is the worst case, never a stalled session).
 *
 * session_id is pulled with sed reading a temp file rather than a JSON parser, so the wrapper needs
 * nothing on PATH but sh + sed — present on every POSIX host Claude Code runs on. A capture that can't
 * find an id skips silently. The capture is written via tmp-then-rename so a reader never sees a
 * half-written file.
 *
 * The wrapped command is the user's own, already trusted and run the same way by Claude Code, so baking
 * it into the script introduces no new trust boundary. (An appDir containing a double-quote, `$`,
 * backtick, or backslash is unsupported — it's baked into a double-quoted sh string, the same
 * path-quoting assumption issue #6 makes for the wrapper path it writes into settings.json.)
 */
export function wrapperScript({ appDir, wrappedCommand }: WrapperSpec): string {
  const callThrough =
    wrappedCommand && wrappedCommand.trim() !== ''
      ? `printf '%s' "$input" | ${wrappedCommand}\n`
      : ''
  return `#!/bin/sh
# code-by-wire statusLine wrapper — AUTO-GENERATED, do not edit (regenerated on every install).
# Captures Claude Code's statusLine JSON to a per-Session file, then renders the user's own statusLine.
input=$(cat)
dir="${appDir}/statusline"
mkdir -p "$dir" 2>/dev/null
tmp="$dir/$$.json.tmp"
printf '%s' "$input" > "$tmp" 2>/dev/null
sid=$(sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$tmp" 2>/dev/null)
if [ -n "$sid" ]; then
  mv -f "$tmp" "$dir/$sid.json" 2>/dev/null
else
  rm -f "$tmp" 2>/dev/null
fi
${callThrough}exit 0
`
}
