import type { ITheme } from "@xterm/xterm";
import {
  VSCODE_DARK_ANSI,
  VSCODE_LIGHT_ANSI,
} from "../ui/vscode-terminal-palette";

// VS Code's default integrated-terminal DARK palette (terminalColorRegistry.ts) — a fixed table,
// not luminance-derived — except background/cursorAccent, which VS Code ships as #1e1e1e but cbw
// overrides to #0e0e0e to match the app's own dark chrome (--theme-neutral-chrome) exactly: the
// terminal-pane frame around this canvas already follows that same literal (see index.css's
// --terminal-editor-surface-background, 2026-07-15 terminal-retheme fix), so leaving VS Code's own
// slightly-lighter default here would reintroduce a visible seam between the frame and the canvas
// whenever both themes are Dark. ANSI slots come from the shared vscode-terminal-palette module
// (also used by the Claude Code terminal).
const DARK_THEME: ITheme = {
  ...VSCODE_DARK_ANSI,
  background: "#0e0e0e",
  foreground: "#cccccc",
  cursor: "#cccccc",
  cursorAccent: "#0e0e0e",
  selectionBackground: "#264f7866",
};

// VS Code's default integrated-terminal LIGHT palette (terminalColorRegistry.ts) — the other half
// of the same source DARK_THEME above came from.
const LIGHT_THEME: ITheme = {
  ...VSCODE_LIGHT_ANSI,
  background: "#ffffff",
  foreground: "#333333",
  cursor: "#333333",
  cursorAccent: "#ffffff",
  selectionBackground: "#add6ff80",
};

export function terminalTheme(mode: "dark" | "light"): ITheme {
  return mode === "light" ? LIGHT_THEME : DARK_THEME;
}
