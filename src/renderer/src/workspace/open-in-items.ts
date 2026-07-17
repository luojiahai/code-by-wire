import type { IconName } from "../ui/icon-names";
import type { OpenInTarget } from "@shared/ipc";
import { tNow, type Translations } from "../i18n";

export interface OpenInItem {
  key: OpenInTarget;
  label: string;
  icon: IconName;
}

/** The host OS's file browser, named the way that OS names it: Finder on macOS, File Explorer on Windows,
 *  a generic File Manager elsewhere. Feeds the file-browser target's label. Finder/File Explorer are the
 *  OS's own official names, translated the way each OS itself localizes them (访达 / 文件资源管理器) —
 *  not left as English loanwords. */
function fileBrowserName(platform: string, t: Translations): string {
  if (platform === "win32") return t.workspace.openIn.fileExplorer;
  if (platform === "darwin") return t.workspace.openIn.finder;
  return t.workspace.openIn.fileManager;
}

/** The targets behind the header's "Open in" dropdown, in menu order. The file-browser target is labelled
 *  for the host OS, so Windows reads "File Explorer" rather than "Finder" — the surrounding "OPEN IN"
 *  section header already supplies the "open in" framing, so this label is just the bare OS name. `key` is
 *  the `OpenInTarget` the renderer hands to `window.api.openIn`; `icon` is constrained to the curated
 *  IconName set (imported from the JSX-free icon-names.ts so this module stays safe to typecheck under the
 *  node program), so a glyph that isn't registered in ui/icons.tsx fails the typecheck. `t` defaults to the
 *  live locale via `tNow()` — resolved fresh per call, never captured at module scope. "VSCode" is a
 *  brand name and stays untranslated, same rule as the product name. */
export function openInItems(
  platform: string,
  t: Translations = tNow(),
): OpenInItem[] {
  return [
    { key: "vscode", label: "VSCode", icon: "square-code" },
    {
      key: "finder",
      label: fileBrowserName(platform, t),
      icon: "folder-open",
    },
  ];
}
