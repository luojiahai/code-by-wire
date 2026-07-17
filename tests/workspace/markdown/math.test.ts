import { describe, it, expect } from "vitest";
import { preprocessMath } from "../../../src/renderer/src/workspace/markdown/math";

describe("preprocessMath — LaTeX delimiter rewriting and currency escaping", () => {
  it("rewrites \\(...\\) inline math to single-dollar form", () => {
    expect(preprocessMath("Euler: \\(e^{i\\pi} + 1 = 0\\) is neat")).toBe(
      "Euler: $e^{i\\pi} + 1 = 0$ is neat",
    );
  });

  it("does not rewrite \\(...\\) that spans a newline", () => {
    const input = "a \\(x\ny\\) b";
    expect(preprocessMath(input)).toBe(input);
  });

  it("rewrites \\[...\\] display math to double-dollar form, multiline allowed", () => {
    expect(preprocessMath("\\[\n\\int_0^1 x\\,dx\n\\]")).toBe(
      "$$\n\\int_0^1 x\\,dx\n$$",
    );
  });

  it("escapes currency dollars so $5 and $10 don't pair into math", () => {
    expect(preprocessMath("costs $5 and $10 today")).toBe(
      "costs \\$5 and \\$10 today",
    );
  });

  it("escapes a currency dollar at the start of the text", () => {
    expect(preprocessMath("$19.99 is the price")).toBe("\\$19.99 is the price");
  });

  it("leaves already-escaped \\$ amounts alone", () => {
    const input = "costs \\$5 today";
    expect(preprocessMath(input)).toBe(input);
  });

  it("leaves dollar math delimiters untouched", () => {
    const input = "inline $x^2$ and display $$e=mc^2$$";
    expect(preprocessMath(input)).toBe(input);
  });

  it("bracket math starting with a digit survives (currency escape runs first)", () => {
    expect(preprocessMath("\\(5x = 10\\)")).toBe("$5x = 10$");
  });

  it("leaves fenced code untouched", () => {
    const input = [
      "before \\(a\\)",
      "```tex",
      "\\(not math\\) and $5",
      "```",
      "after \\(b\\)",
    ].join("\n");
    expect(preprocessMath(input)).toBe(
      [
        "before $a$",
        "```tex",
        "\\(not math\\) and $5",
        "```",
        "after $b$",
      ].join("\n"),
    );
  });

  it("leaves tilde-fenced code untouched", () => {
    const input = ["~~~", "\\[x\\] $7", "~~~"].join("\n");
    expect(preprocessMath(input)).toBe(input);
  });

  it("leaves inline code spans untouched (deviation from hermes)", () => {
    expect(preprocessMath("run `costs $5` or `\\(x\\)` now, pay $5")).toBe(
      "run `costs $5` or `\\(x\\)` now, pay \\$5",
    );
  });

  it("returns text without math or currency unchanged", () => {
    const input = "plain prose with *emphasis* and a [link](https://x.y)";
    expect(preprocessMath(input)).toBe(input);
  });
});
