/** The slice of a keyboard event the editing map reads. A real DOM `KeyboardEvent` satisfies it, so
 *  the terminal store can pass the event straight through, and tests can pass plain objects. */
export interface EditKey {
  type: string;
  key: string;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  /** True while an IME composition is active (real `KeyboardEvent.isComposing`). We bail in that
   *  window so the keystroke reaches xterm's composition handler instead of becoming a readline byte. */
  isComposing: boolean;
}

/**
 * Translate a macOS editing keystroke into the readline control bytes the Claude Code prompt
 * understands, or null to let xterm handle the key untouched.
 *
 * The prompt is readline-style: it does NOT interpret xterm's arrow-modifier sequences (`\x1b[1;3D`
 * for option+arrow, `\x1b[1;5D` for ctrl+arrow), so a raw xterm terminal leaves option+arrow inert.
 * We send the raw readline bytes instead. Only keydown is translated. Shift combos (selection — not a
 * thing in this prompt), ctrl combos, ambiguous cmd+option, keys mid-IME-composition, and everything
 * unmapped return null.
 */
export function macEditSequence(e: EditKey): string | null {
  if (e.type !== "keydown") return null;
  // Mid-composition (CJK/dead-key): let xterm's composition handler own the key. We run before it, so
  // translating here would inject a readline byte into the middle of an IME session and corrupt it.
  if (e.isComposing) return null;
  if (e.ctrlKey || e.shiftKey) return null;
  const cmd = e.metaKey && !e.altKey;
  const opt = e.altKey && !e.metaKey;
  if (cmd) {
    if (e.key === "ArrowLeft") return "\x01"; // Ctrl-A — line start
    if (e.key === "ArrowRight") return "\x05"; // Ctrl-E — line end
    if (e.key === "Backspace") return "\x15"; // Ctrl-U — kill to line start
    if (e.key === "Delete") return "\x0b"; // Ctrl-K — kill to line end (forward delete)
  }
  if (opt) {
    if (e.key === "ArrowLeft") return "\x1bb"; // Esc-b — word back
    if (e.key === "ArrowRight") return "\x1bf"; // Esc-f — word forward
    if (e.key === "Backspace") return "\x17"; // Ctrl-W — delete previous word
    // opt+Delete (forward word-delete, Esc-d) is intentionally unmapped: it needs fn on Mac laptops, so it's rare.
  }
  return null;
}
