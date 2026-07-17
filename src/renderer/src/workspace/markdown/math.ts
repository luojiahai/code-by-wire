/**
 * Fence-aware LaTeX-delimiter preprocessing for transcript markdown.
 *
 * remark-math only recognizes dollar delimiters, and markdown consumes
 * `\[` as an escaped bracket before any plugin sees it — so `\(…\)` /
 * `\[…\]` (the LaTeX convention models also emit) are rewritten to
 * `$…$` / `$$…$$` here, at string level. `$` before a digit is currency
 * in practice (math starts with a letter or \command), and with
 * `singleDollarTextMath` remark-math would pair `$5 … $10` into one
 * inline-math span — so those are escaped to `\$`, which renders as a
 * literal `$`. Adopted from hermes-agent's markdown-preprocess.ts
 * (apps/desktop), with three deliberate deviations:
 *
 * - inline code spans are protected from the rewrites (hermes only
 *   protects fenced blocks);
 * - a standalone single-line `$$…$$` is promoted to fence form (`$$` on
 *   its own lines) — remark-math's flow-math construct is fence-based,
 *   so without this every single-line-authored equation typesets
 *   small/inline (textstyle), and `\[…\]` emits fence form directly for
 *   the same reason;
 * - the currency escape skips a `$` that opens a math-like span — a
 *   closing `$` on the same line with a `\` command between — so
 *   `$1/\pi$` typesets while `$5 and $10` stays prose.
 *
 * JSX-free so the node-config Vitest/typecheck pass can import it (same
 * constraint as lang.ts).
 */

// Fenced blocks pass through untouched. The capture keeps fence segments
// in the split output. Like hermes, a ``` fence "closed" by ~~~ (or an
// unclosed fence) is accepted imprecision — transcript messages arrive
// complete, so dangling fences are malformed input to begin with.
const CODE_FENCE_SPLIT_RE = /((?:```|~~~)[\s\S]*?(?:```|~~~))/g;

// Inline code spans (single line, non-empty) — protected like fences.
const INLINE_CODE_SPLIT_RE = /(`[^`\n]+`)/g;

// A line that is exactly one `$$…$$` span (≤3 spaces of indent — 4+ is
// markdown code — and no `$$` inside). Promoted to fence form before any
// other rewrite so its body is never mistaken for currency.
const SINGLE_LINE_DISPLAY_RE =
  /^ {0,3}\$\$((?:[^$\n]|\$(?!\$))+?)\$\$[ \t]*$/gm;

const CURRENCY_DOLLAR_RE = /(^|[^\\])\$(?=\d)/g;

// Inline \(…\) must not span a newline; display \[…\] may.
const LATEX_INLINE_RE = /\\\(([^\n]+?)\\\)/g;
const LATEX_DISPLAY_RE = /\\\[([\s\S]+?)\\\]/g;

function promoteSingleLineDisplayMath(text: string): string {
  return text.replace(
    SINGLE_LINE_DISPLAY_RE,
    (_, body: string) => `\n$$\n${body}\n$$\n`,
  );
}

// `$` before a digit is escaped as currency unless it opens a math-like
// span: a closing `$` later on the same line (within the same prose
// segment — the inline-code split bounds the scan) with a `\` (TeX
// command) somewhere between. `$1/\pi$` is math; `$5 and $10 today` is
// prose.
function escapeCurrencyDollars(text: string): string {
  return text.replace(
    CURRENCY_DOLLAR_RE,
    (match, prefix: string, offset: number) => {
      const dollarIndex = offset + prefix.length;
      const lineEnd = text.indexOf("\n", dollarIndex + 1);
      const restOfLine = text.slice(
        dollarIndex + 1,
        lineEnd === -1 ? text.length : lineEnd,
      );
      const close = restOfLine.indexOf("$");
      if (close !== -1 && restOfLine.slice(0, close).includes("\\")) {
        return match;
      }
      return `${prefix}\\$`;
    },
  );
}

// Currency runs before the bracket rewrites so digit-leading bracket
// math (`\(5x\)` → `$5x$`) isn't mistaken for currency; display
// brackets emit fence form so they get true display typesetting.
function rewriteProse(text: string): string {
  return escapeCurrencyDollars(text)
    .replace(LATEX_INLINE_RE, (_, body: string) => `$${body}$`)
    .replace(
      LATEX_DISPLAY_RE,
      (_, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`,
    );
}

export function preprocessMath(text: string): string {
  return text
    .split(CODE_FENCE_SPLIT_RE)
    .map((segment) => {
      if (/^(?:```|~~~)/.test(segment)) return segment;
      return promoteSingleLineDisplayMath(segment)
        .split(INLINE_CODE_SPLIT_RE)
        .map((part) => (part.startsWith("`") ? part : rewriteProse(part)))
        .join("");
    })
    .join("");
}
