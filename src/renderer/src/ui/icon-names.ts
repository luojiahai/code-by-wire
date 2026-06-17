/**
 * The curated icon name set, kept in a JSX-free module so the type can be imported from the node
 * program (e.g. the Vitest tests, which `tsconfig.node.json` covers without the `jsx` option) without
 * dragging icons.tsx's JSX into a tsconfig that can't parse it. icons.tsx maps each name to a lucide
 * glyph and is checked against this union via `satisfies Record<IconName, LucideIcon>`, so the two
 * can never drift: add a name here without a glyph there (or vice versa) and the typecheck fails.
 */
export type IconName =
  | "archive"
  | "arrow-up-right"
  | "chart-column"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "chevron-up"
  | "clock"
  | "code"
  | "copy"
  | "folder-open"
  | "github"
  | "git-branch"
  | "git-pull-request-arrow"
  | "info"
  | "loader-circle"
  | "messages-square"
  | "pause"
  | "pencil"
  | "plus"
  | "search"
  | "square"
  | "square-dashed-mouse-pointer"
  | "square-terminal"
  | "terminal"
  | "triangle-alert";
