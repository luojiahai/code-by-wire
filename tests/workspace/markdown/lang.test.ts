import { describe, it, expect } from "vitest";
import {
  LOADED_LANGS,
  ALIAS,
  languageFromClassName,
} from "../../../src/renderer/src/workspace/markdown/lang";

describe("languageFromClassName — resolve a fence class to a loaded Shiki lang", () => {
  it("returns the language id for a loaded language", () => {
    expect(languageFromClassName("language-typescript")).toBe("typescript");
    expect(languageFromClassName("language-python")).toBe("python");
  });

  it("resolves common aliases to their loaded id", () => {
    expect(languageFromClassName("language-ts")).toBe("typescript");
    expect(languageFromClassName("language-js")).toBe("javascript");
    expect(languageFromClassName("language-sh")).toBe("bash");
    expect(languageFromClassName("language-shell")).toBe("bash");
    expect(languageFromClassName("language-yml")).toBe("yaml");
    expect(languageFromClassName("language-md")).toBe("markdown");
  });

  it("is case-insensitive on the fence language", () => {
    expect(languageFromClassName("language-TS")).toBe("typescript");
  });

  it("resolves a language- class surrounded by other classes", () => {
    expect(languageFromClassName("foo language-typescript bar")).toBe(
      "typescript",
    );
  });

  it("falls back to 'text' for unknown or missing languages", () => {
    expect(languageFromClassName("language-cobol")).toBe("text");
    expect(languageFromClassName("")).toBe("text");
    expect(languageFromClassName(undefined)).toBe("text");
    expect(languageFromClassName("not-a-language-class")).toBe("text");
  });

  it("every alias target is itself a loaded language", () => {
    for (const target of Object.values(ALIAS)) {
      expect(LOADED_LANGS).toContain(target);
    }
  });
});
