import { memo } from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "./components";

/**
 * Renders one assistant message's text as markdown (GFM on; raw HTML ignored by default). `remark-breaks`
 * turns single newlines into hard line breaks so prose that hard-wraps on single newlines (lists without
 * blank lines, address-style blocks) renders the way Claude wrote it rather than collapsing to one line.
 * Memoized on `text` so the transcript poll doesn't re-parse unchanged turns. Renders only the in-bubble
 * content; the below-bubble copy button is composed by the assistant branch in events.tsx.
 */
const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

export const MarkdownMessage = memo(function MarkdownMessage({
  text,
}: {
  text: string;
}) {
  return (
    <div className="text-body leading-relaxed">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
        {text}
      </Markdown>
    </div>
  );
});
