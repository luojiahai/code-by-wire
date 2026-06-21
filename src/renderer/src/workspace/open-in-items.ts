import type { IconName } from "../ui/icon-names";
import type { OpenInTarget } from "@shared/ipc";

export interface OpenInItem {
  key: OpenInTarget;
  label: string;
  icon: IconName;
}

/** The host OS's file browser, named the way that OS names it: Finder on macOS, File Explorer on Windows,
 *  a generic File Manager elsewhere. Feeds the file-browser target's label. */
function fileBrowserName(platform: string): string {
  if (platform === "win32") return "File Explorer";
  if (platform === "darwin") return "Finder";
  return "File Manager";
}

/** The targets behind the header's "Open in" dropdown, in menu order. The file-browser target is labelled
 *  for the host OS, so Windows reads "Open in File Explorer" rather than "Finder". `key` is the
 *  `OpenInTarget` the renderer hands to `window.api.openIn`; `icon` is constrained to the curated IconName
 *  set (imported from the JSX-free icon-names.ts so this module stays safe to typecheck under the node
 *  program), so a glyph that isn't registered in ui/icons.tsx fails the typecheck. */
export function openInItems(platform: string): OpenInItem[] {
  return [
    { key: "vscode", label: "VSCode", icon: "code" },
    {
      key: "finder",
      label: `Open in ${fileBrowserName(platform)}`,
      icon: "folder-open",
    },
  ];
}
