import type { EditKey } from "../ui/mac-edit-sequence";
import type { OsKind } from "@shared/platform";

/** What a clipboard keystroke should do: paste, copy, or copy-then-drop-the-selection (Windows
 *  Ctrl+C, so the NEXT Ctrl+C is SIGINT again). Null → not a clipboard key, let xterm proceed. */
export type ClipboardKeyAction = "paste" | "copy" | "copy-and-clear" | null;

/**
 * Classify a key event against VSCode's terminal clipboard keybindings. Without this, xterm turns
 * Ctrl+V into the raw 0x16 byte and preventDefaults the event, so on Windows nothing pastes at all
 * (there's no app menu or other paste path; macOS gets Cmd+V from Electron's default Edit menu).
 *
 * Per-OS bindings, matching VSCode's terminal defaults:
 *  - paste: Ctrl+V and Ctrl+Shift+V on Windows; Ctrl+Shift+V only on Linux — plain Ctrl+V must stay
 *    0x16 there (readline verbatim-insert);
 *  - copy: Ctrl+Shift+C when text is selected; on Windows plain Ctrl+C also copies-and-clears when
 *    text is selected (no selection → xterm still emits 0x03, SIGINT);
 *  - mac: untouched — Cmd+V/Cmd+C flow through natively.
 *
 * Pure: selection state comes in as an argument and the caller does the async clipboard work, so
 * both terminals (terminal-store, shell-terminal/use-terminal-session) share it and tests can
 * table-drive it.
 */
export function clipboardKeyAction(
  e: EditKey,
  os: OsKind,
  hasSelection: boolean,
): ClipboardKeyAction {
  if (e.type !== "keydown") return null; // the combo's keyup falls through harmlessly — xterm emits nothing on keyup
  if (e.isComposing) return null; // mid-IME: same bail as macEditSequence
  if (os === "mac") return null;
  if (!e.ctrlKey || e.metaKey || e.altKey) return null; // !altKey also skips AltGr (= Ctrl+Alt on Windows layouts)
  const key = e.key.toLowerCase(); // shift combos report "V"/"C"
  if (key === "v") {
    return e.shiftKey ? "paste" : os === "windows" ? "paste" : null;
  }
  if (key === "c" && hasSelection) {
    return e.shiftKey ? "copy" : os === "windows" ? "copy-and-clear" : null;
  }
  return null;
}
