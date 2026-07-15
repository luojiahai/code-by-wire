import { describe, it, expect, vi } from "vitest";

vi.mock("@xterm/addon-serialize", () => ({ SerializeAddon: class Fake1 {} }));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: class Fake2 {} }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: class Fake3 {} }));

import { XtermAddonImporter } from "../../src/renderer/src/xterm/xterm-addon-importer";

describe("XtermAddonImporter (vscode xtermAddonImporter.ts pattern)", () => {
  it("resolves each managed addon to its constructor", async () => {
    const importer = new XtermAddonImporter();
    expect((await importer.importAddon("serialize")).name).toBe("Fake1");
    expect((await importer.importAddon("unicode11")).name).toBe("Fake2");
    expect((await importer.importAddon("webgl")).name).toBe("Fake3");
  });

  it("caches constructors module-wide across importer instances", async () => {
    const a = await new XtermAddonImporter().importAddon("webgl");
    const b = await new XtermAddonImporter().importAddon("webgl");
    expect(a).toBe(b);
  });
});
