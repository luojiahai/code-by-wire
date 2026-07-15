import { describe, it, expect } from "vitest";
import { terminalTheme } from "../../src/renderer/src/xterm/terminal-theme";
import {
  VSCODE_DARK_ANSI,
  VSCODE_LIGHT_ANSI,
} from "../../src/renderer/src/xterm/vscode-terminal-palette";

describe("shared terminal theme (spec §8.10)", () => {
  it("dark chrome is the VS Code default with the app-chrome background override", () => {
    const dark = terminalTheme("dark");
    expect(dark.background).toBe("#0e0e0e");
    expect(dark.foreground).toBe("#cccccc");
    expect(dark.cursor).toBe("#cccccc");
    expect(dark.cursorAccent).toBe("#0e0e0e");
    expect(dark.selectionBackground).toBe("#264f7866");
  });

  it("light chrome is the VS Code default", () => {
    const light = terminalTheme("light");
    expect(light.background).toBe("#ffffff");
    expect(light.foreground).toBe("#333333");
    expect(light.selectionBackground).toBe("#add6ff80");
  });

  it("carries the full shared ANSI palette in both modes", () => {
    expect(terminalTheme("dark").red).toBe(VSCODE_DARK_ANSI.red);
    expect(terminalTheme("dark").brightCyan).toBe(VSCODE_DARK_ANSI.brightCyan);
    expect(terminalTheme("light").red).toBe(VSCODE_LIGHT_ANSI.red);
  });

  it("per-terminal overrides win (Claude's teal cursor) without touching ANSI", () => {
    const claude = terminalTheme("dark", { cursor: "#2dd4bf" });
    expect(claude.cursor).toBe("#2dd4bf");
    expect(claude.background).toBe("#0e0e0e");
    expect(claude.red).toBe(VSCODE_DARK_ANSI.red);
  });
});
