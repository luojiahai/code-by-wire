import { describe, it, expect, vi, afterEach } from "vitest";
import { warmTerminalFonts } from "../../src/renderer/src/xterm/font-warmup";

afterEach(() => {
  // jsdom has no document.fonts by default; remove any stub we installed.
  delete (document as unknown as Record<string, unknown>).fonts;
});

describe("warmTerminalFonts", () => {
  it("resolves immediately when document.fonts is unavailable", async () => {
    await expect(warmTerminalFonts(11)).resolves.toBeDefined();
  });

  it("loads the three JetBrains Mono variants at the given size", async () => {
    const load = vi.fn().mockResolvedValue([]);
    (document as unknown as Record<string, unknown>).fonts = { load };
    await warmTerminalFonts(12);
    expect(load.mock.calls.map((c) => c[0])).toEqual([
      "400 12px 'JetBrains Mono Variable'",
      "700 12px 'JetBrains Mono Variable'",
      "italic 400 12px 'JetBrains Mono Variable'",
    ]);
  });

  it("resolves even when loading rejects (best-effort warm-up)", async () => {
    (document as unknown as Record<string, unknown>).fonts = {
      load: vi.fn().mockRejectedValue(new Error("no font")),
    };
    await expect(warmTerminalFonts(11)).resolves.toBeDefined();
  });
});
