import { macEditSequence, type EditKey } from "../ui/mac-edit-sequence";

/**
 * Cross-platform dispatcher: Shift+Enter → the newline byte the Claude Code prompt understands,
 * then the macOS readline edit keys (mac only). Returns null to let xterm handle the key untouched.
 *
 * xterm emits a bare CR for Shift+Enter, which the prompt reads as submit (same as plain Enter). We
 * send the meta+enter sequence (ESC+CR) the prompt treats as a literal newline instead — the same
 * sequence `/terminal-setup` wires Shift+Enter to. This applies on every platform; the mac-only
 * edit keys stay behind `isMac`.
 *
 * The remap is pty-wide and not scoped to the prompt: the renderer can't tell which program is
 * reading the pty, so Shift+Enter sends ESC+CR even when you shell out (where it no longer submits).
 * That's intentional — this terminal exists to drive the agent prompt, and the macOS readline edit
 * keys above already take the same all-programs stance. The shell-rail terminal does NOT use this
 * dispatcher — it wires `macEditSequence` directly (see shell-terminal/use-terminal-session.ts) so a
 * real shell's bare Enter still submits.
 */
export function editSequence(e: EditKey, isMac: boolean): string | null {
  if (
    e.type === "keydown" &&
    !e.isComposing && // mid-IME: let xterm's composition handler own the key
    e.shiftKey &&
    e.key === "Enter" &&
    !e.metaKey &&
    !e.altKey &&
    !e.ctrlKey
  ) {
    return "\x1b\r"; // Esc+CR — newline in the prompt, not submit
  }
  return isMac ? macEditSequence(e) : null;
}
