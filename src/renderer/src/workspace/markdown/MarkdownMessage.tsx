import { memo } from "react";
import Markdown, { type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { markdownComponents } from "./components";
import { preprocessMath } from "./math";

/**
 * Renders one assistant message's text as markdown (GFM on; raw HTML ignored by default). `remark-breaks`
 * turns single newlines into hard line breaks so prose that hard-wraps on single newlines (lists without
 * blank lines, address-style blocks) renders the way Claude wrote it rather than collapsing to one line.
 * LaTeX math typesets via KaTeX: `preprocessMath` rewrites `\(…\)`/`\[…\]` to the dollar delimiters
 * `remark-math` understands and escapes currency dollars; `rehype-katex` replaces math nodes (incl.
 * ```math fences) during the rehype phase, so `markdownComponents`' code/pre overrides never see them.
 * Memoized on `text` so the transcript poll doesn't re-parse unchanged turns. Renders only the in-bubble
 * content; the below-bubble copy button is composed by the assistant branch in events.tsx.
 */
const REMARK_PLUGINS: Options["remarkPlugins"] = [
  remarkGfm,
  remarkBreaks,
  [remarkMath, { singleDollarTextMath: true }],
];

const REHYPE_PLUGINS: Options["rehypePlugins"] = [
  [rehypeKatex, { errorColor: "var(--color-fg-muted)" }],
];

export const MarkdownMessage = memo(function MarkdownMessage({
  text,
}: {
  text: string;
}) {
  return (
    <div className="text-body leading-relaxed">
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={markdownComponents}
      >
        {preprocessMath(text)}
      </Markdown>
    </div>
  );
});
