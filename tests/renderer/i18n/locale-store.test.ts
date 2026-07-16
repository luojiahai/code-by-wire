import { describe, it, expect, beforeEach } from "vitest";
import { $locale, tNow } from "../../../src/renderer/src/i18n/locale-store";

describe("locale-store", () => {
  beforeEach(() => {
    // Reset to the module default between tests — the lang side effect subscription is global.
    $locale.set("en");
  });

  it("$locale defaults to en", () => {
    expect($locale.get()).toBe("en");
  });

  it("mirrors the locale into document.documentElement.lang (zh → zh-CN)", () => {
    $locale.set("zh");
    expect(document.documentElement.lang).toBe("zh-CN");
    $locale.set("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("tNow() returns the active catalog", () => {
    expect(tNow().settings.appearance.language).toBe("Language");
    $locale.set("zh");
    expect(tNow().settings.appearance.language).toBe("语言");
  });
});
