import type { ITheme } from "@xterm/xterm";
import { VSCODE_DARK_ANSI, VSCODE_LIGHT_ANSI } from "./vscode-terminal-palette";

/** Per-terminal chrome overrides on the shared VS Code chrome (spec §8.10): the Claude
 *  terminal keeps its teal working-accent cursor; everything else converges. */
export interface TerminalThemeOverrides {
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
}

// VS Code's default integrated-terminal chrome (terminalColorRegistry.ts) — except
// background/cursorAccent, which VS Code ships as #1e1e1e but cbw overrides to #0e0e0e to
// match the app's own dark chrome (--theme-neutral-chrome) exactly: the terminal-pane frame
// (index.css --terminal-editor-surface-background) uses the same literal, and a different
// canvas value would draw a visible seam between frame and canvas whenever both themes are
// Dark. ANSI slots come from the shared vscode-terminal-palette module.
const DARK_CHROME = {
  background: "#0e0e0e",
  foreground: "#cccccc",
  cursor: "#cccccc",
  cursorAccent: "#0e0e0e",
  selectionBackground: "#264f7866",
} as const;

// The light half of the same VS Code source.
const LIGHT_CHROME = {
  background: "#ffffff",
  foreground: "#333333",
  cursor: "#333333",
  cursorAccent: "#ffffff",
  selectionBackground: "#add6ff80",
} as const;

export function terminalTheme(
  mode: "dark" | "light",
  overrides?: TerminalThemeOverrides,
): ITheme {
  return mode === "light"
    ? { ...VSCODE_LIGHT_ANSI, ...LIGHT_CHROME, ...overrides }
    : { ...VSCODE_DARK_ANSI, ...DARK_CHROME, ...overrides };
}
