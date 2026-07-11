import { quotePosixPath } from "../terminal/file-drop";

/** Read one ANSI escape sequence starting at `index`, or null if `index` isn't ESC. CSI (ESC [)
 *  runs to its final byte; OSC (ESC ]) to BEL or ST; charset and other short ESC forms are three
 *  bytes (e.g. ESC ( B) — treating only ESC+( as the sequence would leave the final selector as
 *  printable text and disarm the prompt-gap stripper before it eats the shell's leading newline. */
export function readEscapeSequence(data: string, index: number): string | null {
  if (data.charCodeAt(index) !== 0x1b || index + 1 >= data.length) return null;
  const kind = data[index + 1];
  if (kind === "[") {
    for (let i = index + 2; i < data.length; i += 1) {
      const code = data.charCodeAt(i);
      if (code >= 0x40 && code <= 0x7e) return data.slice(index, i + 1);
    }
  }
  if (kind === "]") {
    for (let i = index + 2; i < data.length; i += 1) {
      if (data.charCodeAt(i) === 0x07) return data.slice(index, i + 1);
      if (data.charCodeAt(i) === 0x1b && data[i + 1] === "\\")
        return data.slice(index, i + 2);
    }
  }
  if (
    ["(", ")", "*", "+", "-", ".", "/"].includes(kind) &&
    index + 2 < data.length
  ) {
    return data.slice(index, index + 3);
  }
  return data.slice(index, Math.min(index + 2, data.length));
}

export function stripEscapeSequences(data: string): string {
  let index = 0;
  let text = "";
  while (index < data.length) {
    const sequence = readEscapeSequence(data, index);
    if (sequence) {
      index += sequence.length;
    } else {
      text += data[index];
      index += 1;
    }
  }
  return text;
}

/** Keep only the ANSI escape sequences, dropping printable text — applies control codes (e.g. a
 *  clear-screen) while discarding boot spacers and zsh's reverse-video "%" partial-line marker. */
export function keepEscapeSequences(data: string): string {
  let index = 0;
  let out = "";
  while (index < data.length) {
    if (data.charCodeAt(index) === 0x1b) {
      const sequence = readEscapeSequence(data, index);
      if (sequence) {
        out += sequence;
        index += sequence.length;
        continue;
      }
    }
    index += 1;
  }
  return out;
}

/** Drop leading blank rows (preserving escape prefixes) so the first prompt lands flush at the
 *  top — no starship `add_newline` gap. Renderer-cosmetic only; never injected into the shell. */
export function stripInitialPromptGap(data: string): string {
  let index = 0;
  let prefix = "";
  while (index < data.length) {
    const sequence = readEscapeSequence(data, index);
    if (sequence) {
      prefix += sequence;
      index += sequence.length;
    } else if (data[index] === "\r" || data[index] === "\n") {
      index += 1;
    } else {
      return prefix + data.slice(index);
    }
  }
  return prefix;
}

/** Trim the shell's trailing idle prompt from a serialized snapshot before persisting. Without it
 *  the saved buffer ends in the old prompt, so the next launch replays it directly above the fresh
 *  shell's prompt ("double bar"). A prompt is the short block (≤3 lines) after the last blank
 *  line; a longer tail is real output and is kept. */
export function cleanReviveSnapshot(serialized: string): string {
  const visible = (line: string): string =>
    stripEscapeSequences(line).replace(/[\s%]/g, "");
  const lines = serialized.split(/\r?\n/);
  while (lines.length && visible(lines[lines.length - 1]) === "") lines.pop();
  let lastBlank = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (visible(lines[i]) === "") {
      lastBlank = i;
      break;
    }
  }
  if (lastBlank >= 0 && lines.length - 1 - lastBlank <= 3) {
    lines.length = lastBlank;
  }
  return lines.join("\r\n");
}

/** Shell-quote a dropped path, keyed off the resolved shell name (PowerShell/cmd/POSIX rules). */
export function quotePathForShell(path: string, shellName: string): string {
  const shell = shellName.toLowerCase();
  if (shell.includes("powershell") || shell.includes("pwsh")) {
    return `'${path.replace(/'/g, "''")}'`;
  }
  if (shell.includes("cmd")) {
    return `"${path.replace(/"/g, '""')}"`;
  }
  return quotePosixPath(path);
}
