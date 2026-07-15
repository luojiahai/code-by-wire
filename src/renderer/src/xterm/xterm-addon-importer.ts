/** Ported from microsoft/vscode (MIT) — src/vs/workbench/contrib/terminal/browser/xterm/
 *  xtermAddonImporter.ts — adapted for code-by-wire (dynamic import() instead of
 *  importAMDNodeModule; vite code-splits each addon out of the initial chunk). The ctor
 *  cache is module-level so every importer instance shares it (vscode :33). */

export interface XtermAddonNameToCtor {
  serialize: typeof import("@xterm/addon-serialize").SerializeAddon;
  unicode11: typeof import("@xterm/addon-unicode11").Unicode11Addon;
  webgl: typeof import("@xterm/addon-webgl").WebglAddon;
}

export type XtermAddonName = keyof XtermAddonNameToCtor;

const importedAddons = new Map<
  XtermAddonName,
  XtermAddonNameToCtor[XtermAddonName]
>();

export class XtermAddonImporter {
  async importAddon<T extends XtermAddonName>(
    name: T,
  ): Promise<XtermAddonNameToCtor[T]> {
    let ctor = importedAddons.get(name);
    if (!ctor) {
      switch (name) {
        case "serialize":
          ctor = (await import("@xterm/addon-serialize")).SerializeAddon;
          break;
        case "unicode11":
          ctor = (await import("@xterm/addon-unicode11")).Unicode11Addon;
          break;
        case "webgl":
          ctor = (await import("@xterm/addon-webgl")).WebglAddon;
          break;
      }
      if (!ctor) throw new Error(`Could not load addon ${name}`);
      importedAddons.set(name, ctor);
    }
    return ctor as XtermAddonNameToCtor[T];
  }
}
