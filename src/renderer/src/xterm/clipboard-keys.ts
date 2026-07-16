import type { EditKey } from "../ui/mac-edit-sequence";

/**
 * The clipboard keymap both terminals share — VS Code's platform defaults
 * (terminalContrib/clipboard/browser/terminal.clipboard.contribution.ts), hardcoded. Pure
 * decision functions: no DOM, no IPC — the effect layer (clipboard-actions) executes the verdicts.
 *
 * Why this exists: the app has no clipboard keybindings, so copy/paste only works on macOS, by
 * accident — Electron's default menu consumes Cmd+C/V natively before the renderer sees them. On
 * Windows/Linux xterm swallows Ctrl+V/Ctrl+C into `^V`/`^C` pty bytes (preventDefault included),
 * so the menu accelerator never fires and keyboard copy AND paste are both dead.
 *
 * darwin maps to null for everything, deliberately: the menu path already works, and plain
 * `^C`/`^V` bytes must keep reaching the pty (the Claude CLI binds `^V` to image paste).
 */
export type ClipboardKeyAction =
  | "copy" // write the selection to the clipboard (Ctrl+Shift+C)
  | "copy-and-clear" // …and clear the selection (VS Code's Windows Ctrl+C)
  | "paste" // system clipboard → paste; empty read falls back to the ^V byte (Windows Ctrl+V)
  | "paste-no-fallback" // paste with no fallback byte (Ctrl+Shift+V, right-click)
  | "paste-selection"; // Linux X11 selection clipboard → paste (Shift+Insert)

/** Classify a keydown into a clipboard action, or null to let xterm process the key. */
export function clipboardKeyAction(
  e: EditKey,
  platform: string,
  hasSelection: boolean,
): ClipboardKeyAction | null {
  if (e.type !== "keydown") return null;
  // Mid-composition (CJK/dead-key): the keystroke belongs to xterm's IME handler.
  if (e.isComposing) return null;
  if (platform === "darwin") return null;
  // metaKey never participates; altKey excluded because AltGr = Ctrl+Alt on European Windows
  // layouts — Ctrl+Alt+V is how you TYPE a character there, never a paste.
  if (e.metaKey || e.altKey) return null;
  if (!e.ctrlKey) {
    // Shift+Insert: X11 selection paste on Linux. On Windows Chromium's native insert
    // handling already pastes (xterm doesn't swallow Insert), so we leave it alone.
    if (platform === "linux" && e.shiftKey && e.key === "Insert") {
      return "paste-selection";
    }
    return null;
  }
  const k = e.key.toLowerCase(); // Shift combos arrive uppercase ("V"), plain ones lowercase
  if (e.shiftKey) {
    if (k === "v") return "paste-no-fallback";
    if (k === "c") return hasSelection ? "copy" : null;
    return null;
  }
  if (platform === "win32") {
    if (k === "v") return "paste";
    // Only with a selection — without one Ctrl+C must stay the shell's SIGINT.
    if (k === "c") return hasSelection ? "copy-and-clear" : null;
  }
  return null;
}

/** VS Code's Windows `rightClickBehavior: "copyPaste"` default: copy when there is a selection,
 *  else paste. Shift forces the (nonexistent) context menu in VS Code, so shift+right-click is
 *  ignored. mac/linux defaults need a terminal context menu this app doesn't have — untouched. */
export function rightClickAction(
  platform: string,
  hasSelection: boolean,
  shiftKey: boolean,
): "copy-and-clear" | "paste-no-fallback" | null {
  if (platform !== "win32" || shiftKey) return null;
  return hasSelection ? "copy-and-clear" : "paste-no-fallback";
}

/**
 * The non-dialog part of VS Code's shouldPasteTerminalText: when the shell is NOT in bracketed
 * paste mode and the text is exactly one line plus a trailing newline, strip the newline so a
 * copied command can't auto-execute (clipboard-hijack mitigation — the user reviews and presses
 * Enter). Bracketed paste hands multi-line text to the shell safely, so it passes untouched.
 * Returns null when nothing pasteable remains. No multi-line warning dialog (out of scope).
 */
export function preparePasteText(
  text: string,
  bracketedPasteMode: boolean,
): string | null {
  if (text.length === 0) return null;
  if (!bracketedPasteMode) {
    const lines = text.split(/\r?\n/);
    if (lines.length === 2 && lines[1].trim().length === 0) {
      return lines[0].length > 0 ? lines[0] : null;
    }
  }
  return text;
}
