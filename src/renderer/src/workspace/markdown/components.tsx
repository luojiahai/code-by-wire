import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import { isInlineCode, type Element } from "react-shiki";
import { CodeBlock } from "./CodeBlock";
import { ExternalLink } from "./ExternalLink";
import { languageFromClassName } from "./lang";

/** Flatten a code fence's children to its raw text. For a fenced block react-markdown passes a single
 *  string, but a non-string (an array of nodes) must not silently drop the code — recurse and keep the
 *  text. Avoids String(children), which would emit "[object Object]" or comma-join an array. */
function codeText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(codeText).join("");
  return "";
}

/** Tailwind-token overrides for assistant markdown. Restrained: color stays state-only, teal only on
 *  links, code is the only multicolor surface (contained to the well by CodeBlock). */
export const markdownComponents: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-fg">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-fg-faint">{children}</del>,
  a: ({ href, children }) => (
    <ExternalLink href={href}>{children}</ExternalLink>
  ),
  // No <img>: render images as a click-to-open link so untrusted image URLs in assistant output don't
  // auto-fetch on render. Labelled with the alt text when present.
  img: ({ src, alt }) => (
    <ExternalLink href={typeof src === "string" ? src : undefined}>
      {alt || "image"}
    </ExternalLink>
  ),
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-heading font-semibold leading-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-title font-semibold leading-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-subhead font-semibold leading-tight first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-3 text-body font-semibold text-fg-muted first:mt-0">
      {children}
    </h4>
  ),
  // GFM task lists arrive as `ul.contains-task-list > li.task-list-item` with a disabled checkbox. Drop
  // the disc/indent for those so the checkbox isn't doubled up with a bullet; plain lists keep the disc.
  ul: ({ className, children }) =>
    className?.includes("contains-task-list") ? (
      <ul className="my-2 list-none pl-0">{children}</ul>
    ) : (
      <ul className="my-2 list-disc pl-5 marker:text-fg-faint">{children}</ul>
    ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal pl-5 marker:text-fg-faint">{children}</ol>
  ),
  li: ({ className, children }) =>
    className?.includes("task-list-item") ? (
      <li className="my-0.5 [&>input]:mr-2 [&>input]:align-middle">
        {children}
      </li>
    ) : (
      <li className="my-0.5">{children}</li>
    ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-ink-700 pl-3 text-fg-muted">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-ink-800" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-body">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-ink-800 bg-ink-900 px-2.5 py-1 text-left font-semibold text-fg">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-ink-800 px-2.5 py-1 text-fg-muted">
      {children}
    </td>
  ),
  // react-markdown wraps a fenced block in <pre><code>. CodeBlock renders its own surface, so the
  // pre must pass through to avoid a <pre> nested inside our block wrapper.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, node }) => {
    const inline = node ? isInlineCode(node as unknown as Element) : false;
    if (inline) {
      return (
        <code className="rounded border border-ink-800 bg-ink-900 px-1 py-0.5 font-mono text-aux text-fg">
          {children}
        </code>
      );
    }
    const code = codeText(children).replace(/\n$/, "");
    return (
      <CodeBlock code={code} language={languageFromClassName(className)} />
    );
  },
};
