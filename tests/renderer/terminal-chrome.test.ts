import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// No DOM, no xterm import (that file pulls in the DOM-bound lib): read the sources as text, like
// theme-colors.test.ts does, and assert the chrome shape.
const root = join(__dirname, "..", "..");
const css = readFileSync(join(root, "src/renderer/src/index.css"), "utf8");
const view = readFileSync(
  join(root, "src/renderer/src/terminal/TerminalView.tsx"),
  "utf8",
);
const workspace = readFileSync(
  join(root, "src/renderer/src/workspace/Workspace.tsx"),
  "utf8",
);

describe("terminal chrome — borderless, padded, edge scrollbar", () => {
  it("the container has no border or radius and keeps the well background", () => {
    const m = /className="([^"]*\bbg-well\b[^"]*)"/.exec(view);
    expect(m, "TerminalView container className with bg-well").toBeTruthy();
    const cls = m![1];
    expect(cls, "hairline border removed").not.toMatch(/\bborder\b/);
    expect(cls, "corner radius removed (square)").not.toMatch(/\brounded/);
    expect(cls, "well kept so the padding gutter stays #080808").toContain(
      "bg-well",
    );
  });

  it("pads the .xterm element so FitAddon fits the content inside the padding", () => {
    expect(css).toMatch(/\.xterm\s*\{[^}]*padding:\s*8px/);
  });

  it("keeps the native viewport scrollbar transparent and renders the overlay thumb instead", () => {
    // The viewport background stays transparent so the #080808 well shows through during overscroll.
    expect(css).toMatch(
      /\.xterm\s+\.xterm-viewport\s*\{[^}]*background:\s*transparent/,
    );
    // The native scrollbar is kept only to reserve the right strip and is rendered transparent — the
    // visible scrollbar is the shared overlay thumb attached over the viewport in xterm-factory.
    expect(css).toMatch(
      /\.xterm-viewport[^{]*::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*transparent/,
    );
    const factory = readFileSync(
      join(root, "src/renderer/src/terminal/xterm-factory.ts"),
      "utf8",
    );
    expect(
      factory,
      "terminal uses the app's shared overlay-scroll-thumb",
    ).toContain("overlay-scroll-thumb");
  });

  it("lets the terminal fill its wrapper with no outer padding (only the 8px inside it)", () => {
    const m = /className="([^"]*)"[^>]*>\s*<TerminalView/.exec(workspace);
    expect(m, "wrapper div around TerminalView in Workspace.tsx").toBeTruthy();
    expect(
      m![1],
      "no outer padding/margin on the terminal wrapper",
    ).not.toMatch(/\b[pm][xytrbl]?-/);
  });
});
