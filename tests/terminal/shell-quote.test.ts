import { describe, it, expect } from "vitest";
import { quoteShellArg } from "../../src/main/terminal/shell-quote";

describe("quoteShellArg", () => {
  it("wraps a plain arg in single quotes", () => {
    expect(quoteShellArg("abc")).toBe("'abc'");
  });

  it("preserves spaces", () => {
    expect(quoteShellArg("a b")).toBe("'a b'");
  });

  it("escapes an embedded single quote", () => {
    expect(quoteShellArg("it's")).toBe("'it'\\''s'");
  });

  it("leaves shell metacharacters inert inside single quotes", () => {
    expect(quoteShellArg('$HOME `x` "y"')).toBe("'$HOME `x` \"y\"'");
  });

  it("handles an empty string", () => {
    expect(quoteShellArg("")).toBe("''");
  });
});
