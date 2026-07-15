import type { ITheme } from "@xterm/xterm";

/** The 16 xterm ANSI color slots, without the terminal's own background/foreground/cursor keys —
 *  those stay per-terminal (each surface picks its own chrome-matching values). */
type AnsiPalette = Pick<
  ITheme,
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "brightBlack"
  | "brightRed"
  | "brightGreen"
  | "brightYellow"
  | "brightBlue"
  | "brightMagenta"
  | "brightCyan"
  | "brightWhite"
>;

/** VS Code's default integrated-terminal DARK ANSI palette (terminalColorRegistry.ts) — a fixed
 *  table, not luminance-derived. Shared by both terminal implementations so dimmed/thinking-style
 *  CLI output reads consistently everywhere, instead of falling back to xterm.js's own (differently
 *  tuned, dark-only-legible) default palette. Matches hermes's terminal DARK_THEME ANSI slots
 *  byte-for-byte (~/Code/hermes-agent/apps/desktop/src/app/right-sidebar/terminal/selection.ts). */
export const VSCODE_DARK_ANSI: AnsiPalette = {
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

/** VS Code's default integrated-terminal LIGHT ANSI palette — the other half of the same source
 *  DARK palette above came from. Matches hermes's terminal LIGHT_THEME ANSI slots byte-for-byte. */
export const VSCODE_LIGHT_ANSI: AnsiPalette = {
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
