import { describe, it, expect, beforeEach } from "vitest";
import {
  $appTheme,
  $terminalTheme,
} from "../../src/renderer/src/ui/appearance-store";

describe("appearance-store", () => {
  beforeEach(() => {
    // Reset to the module's own default between tests — the DOM-side-effect subscription is global.
    $appTheme.set("dark");
    $terminalTheme.set("dark");
  });

  it("$appTheme defaults to dark", () => {
    expect($appTheme.get()).toBe("dark");
  });

  it("$terminalTheme is independent of $appTheme", () => {
    $appTheme.set("light");
    expect($terminalTheme.get()).toBe("dark");
  });

  it("setting $appTheme updates document.documentElement's data-theme and color-scheme", () => {
    $appTheme.set("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");

    $appTheme.set("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("setting $terminalTheme updates document.documentElement's data-terminal-theme, independent of data-theme/color-scheme", () => {
    // Regression test for the terminal-retheme fix: index.css's terminal-pane chrome
    // (--terminal-editor-surface-background/--terminal-well-background) reads this attribute, not
    // data-theme, so it must move independently of App theme's own attribute/colorScheme writes.
    $appTheme.set("dark");
    $terminalTheme.set("light");
    expect(document.documentElement.dataset.terminalTheme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    $terminalTheme.set("dark");
    expect(document.documentElement.dataset.terminalTheme).toBe("dark");
  });
});
