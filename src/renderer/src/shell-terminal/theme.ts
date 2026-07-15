import type { ITheme } from "@xterm/xterm";

/** VS Code's default integrated-terminal DARK palette (terminalColorRegistry.ts) — a fixed table,
 *  not luminance-derived — except background/cursorAccent, which VS Code ships as #1e1e1e but cbw
 *  overrides to #0e0e0e to match the app's own dark chrome (--theme-neutral-chrome) exactly: the
 *  terminal-pane frame around this canvas already follows that same literal (see index.css's
 *  --terminal-editor-surface-background, 2026-07-15 terminal-retheme fix), so leaving VS Code's own
 *  slightly-lighter default here would reintroduce a visible seam between the frame and the canvas
 *  whenever both themes are Dark. */
const DARK_THEME: ITheme = {
  background: "#0e0e0e",
  foreground: "#cccccc",
  cursor: "#cccccc",
  cursorAccent: "#0e0e0e",
  selectionBackground: "#264f7866",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

/** VS Code's default integrated-terminal LIGHT palette (terminalColorRegistry.ts) — the other half
 *  of the same source DARK_THEME above came from. */
const LIGHT_THEME: ITheme = {
  background: "#ffffff",
  foreground: "#333333",
  cursor: "#333333",
  cursorAccent: "#ffffff",
  selectionBackground: "#add6ff80",
  black: "#000000",
  red: "#cd3131",
  green: "#00bc00",
  yellow: "#949800",
  blue: "#0451a5",
  magenta: "#bc05bc",
  cyan: "#0598bc",
  white: "#555555",
  brightBlack: "#666666",
  brightRed: "#cd3131",
  brightGreen: "#14ce14",
  brightYellow: "#b5ba00",
  brightBlue: "#0451a5",
  brightMagenta: "#bc05bc",
  brightCyan: "#0598bc",
  brightWhite: "#a5a5a5",
};

export function terminalTheme(mode: "dark" | "light"): ITheme {
  return mode === "light" ? LIGHT_THEME : DARK_THEME;
}
