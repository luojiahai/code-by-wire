/**
 * Resolve a markdown code fence's `language-xxx` class to a Shiki language id we actually loaded.
 * Pure and JSX-free so the node-config Vitest program can import it. LOADED_LANGS mirrors the
 * dynamic imports in highlighter.ts — keep the two lists in sync.
 */

/** The Shiki language ids loaded by the highlighter singleton (see highlighter.ts). */
export const LOADED_LANGS = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "bash",
  "python",
  "diff",
  "markdown",
  "css",
  "html",
  "sql",
  "go",
  "rust",
  "yaml",
] as const;

const LOADED = new Set<string>(LOADED_LANGS);

/** Fence aliases that map onto a loaded id. */
export const ALIAS: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  py: "python",
  rs: "rust",
  golang: "go",
};

/** A loaded Shiki language id for the fence, or "text" (plaintext) when missing or unsupported. */
export function languageFromClassName(className?: string): string {
  const match = /language-([\w-]+)/.exec(className ?? "");
  const raw = match?.[1]?.toLowerCase();
  if (!raw) return "text";
  const id = ALIAS[raw] ?? raw;
  return LOADED.has(id) ? id : "text";
}
