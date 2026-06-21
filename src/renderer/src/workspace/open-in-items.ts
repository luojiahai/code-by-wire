import type { IconName } from "../ui/icon-names";

export interface OpenInItem {
  key: string;
  label: string;
  icon: IconName;
}

/** The targets behind the header's "Open in" dropdown, in menu order. Every target ships disabled (a
 *  placeholder) until the shell-open plumbing lands. `icon` is constrained to the curated IconName set
 *  (imported from the JSX-free icon-names.ts so this module stays safe to typecheck under the node
 *  program), so a glyph that isn't registered in ui/icons.tsx fails the typecheck. */
export const OPEN_IN_ITEMS: OpenInItem[] = [
  { key: "vscode", label: "VSCode", icon: "code" },
  { key: "finder", label: "Reveal in Finder", icon: "folder-open" },
];
