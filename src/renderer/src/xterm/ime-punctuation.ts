import type { EditKey } from "../ui/mac-edit-sequence";

/** ASCII punctuation — the characters a CJK IME substitutes for their full-width forms
 *  (`\`→`、`, `.`→`。`, `,`→`，`, `?`→`？`…). Letters and digits are excluded: those go through a
 *  real composition, which the `isComposing` guard already covers. */
const ASCII_PUNCTUATION = /^[!-/:-@[-`{-~]$/;

/**
 * True when xterm must NOT emit this keydown itself, so the following `keypress` can deliver the
 * character the IME actually produced.
 *
 * Third-party CJK IMEs substitute punctuation without ever opening a composition: the keydown
 * reports the PHYSICAL key (`\`, keyCode 220, `isComposing` false) and only the `keypress` carries
 * the converted character (charCode 12289 = `、`). xterm's keydown path takes `result.key = ev.key`
 * (common/input/Keyboard.ts) — the physical `\` — sends it, then `cancel()`s the event, which
 * suppresses the very keypress that held the real character. The IME's `、` is lost and the shell
 * receives `\` (issue #439).
 *
 * Returning false from the custom key handler for these keydowns leaves `_keyDownHandled` false and
 * skips the `cancel()`, so xterm's own `_keyPress` runs and emits `String.fromCharCode(ev.charCode)`
 * — the converted character with an IME, the identical ASCII one without. xterm already defers A-Z
 * to keypress for a sibling macOS IME bug (browser/Terminal.ts), so this is its own escape hatch.
 *
 * Scoped to unmodified punctuation deliberately: ctrl/alt/meta combos are control sequences, never
 * IME text, and letters/digits keep the keydown path so the blast radius stays off the hot path.
 */
export function deferToKeypress(e: EditKey): boolean {
  if (e.type !== "keydown") return false;
  if (e.ctrlKey || e.altKey || e.metaKey) return false; // control sequences, not text
  return ASCII_PUNCTUATION.test(e.key); // shift allowed: `?` and `~` need it
}
