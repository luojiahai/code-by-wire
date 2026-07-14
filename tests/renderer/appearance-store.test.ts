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
});
