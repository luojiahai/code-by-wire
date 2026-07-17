import type { WrapperSpec } from "./wrapper";

/** The wrapped command is baked verbatim between these two markers — a single-quoted PowerShell here-string
 *  (`@'…'@`). recoverWrappedCommandWin reads back exactly the bytes between them. The here-string is fully
 *  literal: PowerShell applies no `$`-interpolation and no escaping to its body, so a command containing
 *  `$env:…`, a backtick, or quotes round-trips unchanged, and embedded newlines are preserved instead of
 *  truncating the command or breaking out of a comment line. The only sequence the body cannot contain is a
 *  line consisting solely of `'@` (which would close the here-string early) — the same class of
 *  delimiter-collision edge the POSIX wrapper has with its tail marker. */
const HEREDOC_OPEN = "$cbwCmd = @'\n";
const HEREDOC_CLOSE = "\n'@\n";

/** The fixed script tail emitted after the (optional) call-through. The explicit `exit 0` mirrors the
 *  POSIX wrapper: a faulty wrapped command can never fail the prompt, regardless of whether the
 *  `powershell -File` invocation propagates $LASTEXITCODE. */
const SCRIPT_TAIL = "# CBW_END\nexit 0\n";

/**
 * PowerShell statusLine wrapper for Windows. Captures Claude Code's stdin JSON to a
 * per-session side-channel file under the capture dir next to this script, then calls through to
 * the user's original command so their prompt still renders. Best-effort throughout; never fails
 * the prompt. The wrapped command is baked verbatim into a single-quoted here-string so
 * recoverWrappedCommandWin is its exact inverse (see HEREDOC_OPEN/HEREDOC_CLOSE).
 *
 * The capture dir is `<scriptdir>/statusline/` (relative, via $PSScriptRoot) so a Claude dir
 * containing special characters can't corrupt the script. session_id is extracted via regex.
 * An id containing a path separator is rejected (no traversal out of the capture dir). The
 * capture is published via tmp-then-rename (WriteAllText + Move-Item -Force) so a reader never
 * sees a half-written file. $ErrorActionPreference = 'SilentlyContinue' keeps all capture steps
 * best-effort; the script always exits cleanly.
 *
 * The call-through runs the user's command through `cmd /c` — the same interpreter Claude Code
 * itself uses to run a Windows statusLine command — with the captured JSON piped to its stdin.
 * The command reaches cmd via $cbwCmd (a variable, not a string literal), so PowerShell does not
 * re-interpolate or re-escape it on the way through.
 */
export function wrapperScriptWin({ wrappedCommand }: WrapperSpec): string {
  const callThrough =
    wrappedCommand && wrappedCommand.trim() !== ""
      ? HEREDOC_OPEN +
        wrappedCommand +
        HEREDOC_CLOSE +
        `$json | & cmd.exe /c $cbwCmd 2>$null\n`
      : "";
  return (
    `# flightdeck statusLine wrapper (PowerShell) — AUTO-GENERATED, do not edit.\n` +
    `$ErrorActionPreference = 'SilentlyContinue'\n` +
    // Read stdin and feed the call-through as UTF-8, independent of the host console code page. Windows
    // PowerShell's default $OutputEncoding is US-ASCII, which would turn every non-ASCII byte (a cwd under
    // C:\Users\José, say) into '?'; and [Console]::In decodes with the console's code page, not UTF-8. So
    // read raw stdin through a UTF-8 reader and pin $OutputEncoding to UTF-8, matching the POSIX wrapper's
    // byte-exact replay so a non-ASCII path round-trips to the wrapped command intact.
    `$OutputEncoding = [Text.UTF8Encoding]::new($false)\n` +
    `$json = (New-Object IO.StreamReader([Console]::OpenStandardInput(), [Text.UTF8Encoding]::new($false))).ReadToEnd()\n` +
    `$dir = Join-Path $PSScriptRoot 'statusline'\n` +
    `New-Item -ItemType Directory -Force -Path $dir | Out-Null\n` +
    `$sid = if ($json -match '"session_id"\\s*:\\s*"([^"]+)"') { $Matches[1] } else { $null }\n` +
    `if ($sid -and $sid -notmatch '[\\\\/]') {\n` +
    `  $tmp = Join-Path $dir ($PID.ToString() + '.tmp')\n` +
    `  [IO.File]::WriteAllText($tmp, $json)\n` +
    `  Move-Item -Force $tmp (Join-Path $dir ($sid + '.json'))\n` +
    `}\n` +
    callThrough +
    SCRIPT_TAIL
  );
}

/** Recover the wrapped command baked into a Windows wrapper — exact inverse of wrapperScriptWin. Returns the
 *  bytes between the here-string markers verbatim (multi-line and special characters preserved), or null for
 *  a capture-only wrapper or text this no longer recognizes — both reinstall clean. */
export function recoverWrappedCommandWin(src: string): string | null {
  const start = src.indexOf(HEREDOC_OPEN);
  if (start === -1) return null;
  const contentStart = start + HEREDOC_OPEN.length;
  const end = src.indexOf(HEREDOC_CLOSE, contentStart);
  return end === -1 ? null : src.slice(contentStart, end);
}
