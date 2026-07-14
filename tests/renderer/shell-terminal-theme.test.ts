import { describe, it, expect } from "vitest";
import { terminalTheme } from "../../src/renderer/src/shell-terminal/theme";

describe("shell-terminal terminalTheme(mode)", () => {
  it('returns the existing dark VS Code palette for "dark"', () => {
    const dark = terminalTheme("dark");
    expect(dark.background).toBe("#1e1e1e");
    expect(dark.foreground).toBe("#cccccc");
  });

  it('returns a distinct light VS Code palette for "light"', () => {
    const light = terminalTheme("light");
    expect(light.background).toBe("#ffffff");
    expect(light.foreground).toBe("#333333");
    expect(light.background).not.toBe(terminalTheme("dark").background);
  });
});
