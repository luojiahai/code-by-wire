import { describe, it, expect, vi, beforeEach } from "vitest";

describe("XtermAddonImporter (vscode xtermAddonImporter.ts pattern)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("resolves each managed addon to its constructor", async () => {
    vi.doMock("@xterm/addon-serialize", () => ({
      SerializeAddon: class Fake1 {},
    }));
    vi.doMock("@xterm/addon-unicode11", () => ({
      Unicode11Addon: class Fake2 {},
    }));
    vi.doMock("@xterm/addon-webgl", () => ({ WebglAddon: class Fake3 {} }));
    const { XtermAddonImporter } = await import(
      "../../src/renderer/src/xterm/xterm-addon-importer"
    );
    const importer = new XtermAddonImporter();
    expect((await importer.importAddon("serialize")).name).toBe("Fake1");
    expect((await importer.importAddon("unicode11")).name).toBe("Fake2");
    expect((await importer.importAddon("webgl")).name).toBe("Fake3");
  });

  it("caches the resolved constructor across calls even if the underlying module later changes", async () => {
    vi.doMock("@xterm/addon-webgl", () => ({ WebglAddon: class FakeA {} }));
    const { XtermAddonImporter } = await import(
      "../../src/renderer/src/xterm/xterm-addon-importer"
    );
    const importer = new XtermAddonImporter();
    const first = await importer.importAddon("webgl");
    expect(first.name).toBe("FakeA");

    // Swap the underlying package to a DIFFERENT fake without touching the
    // already-evaluated importer module — proves the cache, not ESM's own
    // same-specifier dedup, is what makes the second call return `first`.
    vi.resetModules();
    vi.doMock("@xterm/addon-webgl", () => ({ WebglAddon: class FakeB {} }));

    const second = await importer.importAddon("webgl");
    expect(second).toBe(first); // still FakeA — the module-level cache held
    expect(second.name).toBe("FakeA");
  });
});
