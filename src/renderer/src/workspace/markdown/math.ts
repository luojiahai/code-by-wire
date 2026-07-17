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
 * (apps/desktop), except inline code spans are protected from both
 * rewrites here — hermes only protects fenced blocks.
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

const CURRENCY_DOLLAR_RE = /(^|[^\\])\$(?=\d)/g;

// Inline \(…\) must not span a newline; display \[…\] may.
const LATEX_INLINE_RE = /\\\(([^\n]+?)\\\)/g;
const LATEX_DISPLAY_RE = /\\\[([\s\S]+?)\\\]/g;

// Currency escape runs before the bracket rewrites so digit-leading
// bracket math (`\(5x\)` → `$5x$`) isn't mistaken for currency.
function rewriteProse(text: string): string {
  return text
    .replace(CURRENCY_DOLLAR_RE, "$1\\$")
    .replace(LATEX_INLINE_RE, (_, body: string) => `$${body}$`)
    .replace(LATEX_DISPLAY_RE, (_, body: string) => `$$${body}$$`);
}

export function preprocessMath(text: string): string {
  return text
    .split(CODE_FENCE_SPLIT_RE)
    .map((segment) => {
      if (/^(?:```|~~~)/.test(segment)) return segment;
      return segment
        .split(INLINE_CODE_SPLIT_RE)
        .map((part) => (part.startsWith("`") ? part : rewriteProse(part)))
        .join("");
    })
    .join("");
}
