import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false });

export function renderChangelog(markdown: string): string {
  return md.render(markdown);
}
