import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALE_OPTIONS,
  normalizeLocale,
} from "../src/shared/locale";

describe("normalizeLocale", () => {
  it("passes through exact supported codes", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("zh")).toBe("zh");
  });

  it("maps Simplified-Chinese aliases to zh (hermes alias table)", () => {
    for (const v of [
      "zh-CN",
      "zh_CN",
      "zh-Hans",
      "zh_hans",
      "zh-Hans-CN",
      "zh_hans_cn",
    ]) {
      expect(normalizeLocale(v)).toBe("zh");
    }
  });

  it("maps English aliases to en", () => {
    for (const v of ["EN", "en-US", "en_us"]) {
      expect(normalizeLocale(v)).toBe("en");
    }
  });

  it("is whitespace- and case-insensitive", () => {
    expect(normalizeLocale("  ZH-CN  ")).toBe("zh");
  });

  it("coerces unsupported and non-string values to the default", () => {
    for (const v of ["fr", "zh-hant", "ja", "", 42, null, undefined, {}]) {
      expect(normalizeLocale(v)).toBe(DEFAULT_LOCALE);
    }
  });
});

describe("LOCALE_OPTIONS", () => {
  it("is the curated en → zh order with endonym names", () => {
    expect(LOCALE_OPTIONS.map((o) => o.id)).toEqual(["en", "zh"]);
    expect(LOCALE_OPTIONS.map((o) => o.name)).toEqual(["English", "简体中文"]);
  });
});
