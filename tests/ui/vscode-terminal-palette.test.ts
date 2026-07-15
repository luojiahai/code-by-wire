import { describe, it, expect } from "vitest";
import {
  VSCODE_DARK_ANSI,
  VSCODE_LIGHT_ANSI,
} from "../../src/renderer/src/ui/vscode-terminal-palette";

const ANSI_KEYS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

describe("VSCODE_DARK_ANSI / VSCODE_LIGHT_ANSI — shared VS Code default ANSI palette", () => {
  it("each has exactly the 16 ANSI slots, no more, no less", () => {
    expect(Object.keys(VSCODE_DARK_ANSI).sort()).toEqual([...ANSI_KEYS].sort());
    expect(Object.keys(VSCODE_LIGHT_ANSI).sort()).toEqual([...ANSI_KEYS].sort());
  });

  it("matches VS Code's / hermes's dark palette exactly", () => {
    expect(VSCODE_DARK_ANSI).toEqual({
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
    });
  });

  it("matches VS Code's / hermes's light palette exactly", () => {
    expect(VSCODE_LIGHT_ANSI).toEqual({
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
    });
  });
});
