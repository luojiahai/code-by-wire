export interface WrapperSpec {
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
 * The capture dir is located relative to the script itself (`${0%/*}/statusline`) rather than baked in,
 * so a Claude dir containing a `$`, backtick, quote, or backslash can't corrupt the script. stdin is
 * written to a file once and replayed to the wrapped command from that file (`cat "$src" | …`), so the
 * command receives Claude's bytes verbatim — a trailing newline is preserved, unlike `$(cat)`.
 *
 * session_id is pulled with sed rather than a JSON parser, so the wrapper needs nothing on PATH but
 * sh + sed — present on every POSIX host Claude Code runs on. An id containing a path separator is
 * rejected (no `../` traversal out of the capture dir); a capture with no usable id is fed through and
 * cleaned up, never persisted. The capture is published via tmp-then-rename so a reader never sees a
 * half-written file.
 *
 * The wrapped command is the user's own, already trusted and run the same way by Claude Code, so baking
 * it into the script introduces no new trust boundary.
 */
export function wrapperScript({ wrappedCommand }: WrapperSpec): string {
  const callThrough =
    wrappedCommand && wrappedCommand.trim() !== '' ? `cat "$src" | ${wrappedCommand}\n` : ''
  return `#!/bin/sh
# code-by-wire statusLine wrapper — AUTO-GENERATED, do not edit (regenerated on every install).
# Captures Claude Code's statusLine JSON to a per-Session file, then renders the user's own statusLine.
dir="\${0%/*}/statusline"
mkdir -p "$dir" 2>/dev/null
raw="$dir/$$.json.tmp"
cat > "$raw" 2>/dev/null
sid=$(sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' "$raw" 2>/dev/null)
case "$sid" in */*) sid= ;; esac
if [ -n "$sid" ]; then
  mv -f "$raw" "$dir/$sid.json" 2>/dev/null
  src="$dir/$sid.json"
else
  src="$raw"
fi
${callThrough}rm -f "$raw" 2>/dev/null
exit 0
`
}
