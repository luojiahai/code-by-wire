import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "./components";

/**
 * Renders one assistant message's text as markdown (GFM on; raw HTML ignored by default). Memoized on
 * `text` so the transcript poll doesn't re-parse unchanged turns. Renders only the in-bubble content;
 * the below-bubble copy button is composed by the assistant branch in events.tsx.
 */
export const MarkdownMessage = memo(function MarkdownMessage({
  text,
}: {
  text: string;
}) {
  return (
    <div className="text-[13px] leading-relaxed">
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </Markdown>
    </div>
  );
});
