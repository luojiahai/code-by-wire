import { $terminalTakeover, setTerminalTakeover } from "./store";

/** Ctrl+` toggles the terminal — literal Ctrl on every platform (⌘` is macOS-reserved), matching
 *  VS Code/Cursor/Zed and hermes. Capture-phase so the toggle wins over a focused xterm (which
 *  would otherwise swallow the keydown into the shell). */
export function installTerminalKeybind(): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (
      !e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.shiftKey ||
      e.code !== "Backquote"
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setTerminalTakeover(!$terminalTakeover.get());
  };
  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () =>
    window.removeEventListener("keydown", onKeyDown, { capture: true });
}
