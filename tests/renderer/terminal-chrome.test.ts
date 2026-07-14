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
  it("the container has no border or radius and follows Terminal theme, not the app well", () => {
    // Was plain `bg-well` (an App-theme token shared with inputs/code blocks) until the 2026-07-15
    // terminal-retheme fix: that coupling left this container's padding gutter locked to App theme,
    // producing a wrong-colored frame around the terminal whenever Terminal theme diverged from App
    // theme (and, since xterm's own canvas already repaints correctly on a theme change, made an
    // otherwise-correctly-repainted terminal LOOK stale — the frame is what actually didn't move).
    // --terminal-well-background is the Terminal-theme-scoped seed (index.css) that replaces it —
    // #080808 in dark mode, matching --color-well's own dark literal exactly, so this assertion's
    // original intent (padding gutter stays #080808 in dark mode) still holds.
    const m =
      /className="([^"]*\bbg-\(--terminal-well-background\)[^"]*)"/.exec(view);
    expect(
      m,
      "TerminalView container className with bg-(--terminal-well-background)",
    ).toBeTruthy();
    const cls = m![1];
    expect(cls, "hairline border removed").not.toMatch(/\bborder\b/);
    expect(cls, "corner radius removed (square)").not.toMatch(/\brounded/);
  });

  it("pads the .xterm element so FitAddon fits the content inside the padding", () => {
    expect(css).toMatch(/\.xterm\s*\{[^}]*padding:\s*8px/);
  });

  it("keeps the native viewport scrollbar transparent and renders the overlay thumb instead", () => {
    // The viewport background stays transparent so the #080808 well shows through during overscroll.
    expect(css).toMatch(
      /\.xterm\s+\.xterm-viewport\s*\{[^}]*background:\s*transparent/,
    );
    // The native scrollbar is kept only to reserve the right strip (scrollbar-width: thin from the
    // global rule) and is rendered invisible via scrollbar-color — the modern property that actually
    // wins in Chromium ≥121, where ::-webkit-scrollbar-* rules are ignored once it's set. The visible
    // scrollbar is the shared overlay thumb attached over the viewport in xterm-factory.
    expect(css).toMatch(
      /\.xterm\s+\.xterm-viewport\s*\{[^}]*scrollbar-color:\s*transparent transparent/,
    );
    const factory = readFileSync(
      join(root, "src/renderer/src/terminal/xterm-factory.ts"),
      "utf8",
    );
    expect(
      factory,
      "factory delegates to the shared overlay scrollbar attach",
    ).toContain('from "./overlay-scrollbar"');
    const overlay = readFileSync(
      join(root, "src/renderer/src/terminal/overlay-scrollbar.ts"),
      "utf8",
    );
    expect(
      overlay,
      "terminal uses the app's shared overlay-scroll-thumb",
    ).toContain("overlay-scroll-thumb");
  });

  it("lets the terminal fill its wrapper with no outer padding (only the 8px inside it)", () => {
    // TerminalView backs the `terminalSlot` local in CenterView (a ternary that picks it for a live
    // Managed session, else the ObservedTerminal panel). CenterView wraps the slot in a plain
    // `<div className="h-full">` — no padding classes. Assert both: no padded wrapper sits between the
    // `const terminalSlot =` binding and `<TerminalView`, and the CenterView inner wrapper carries only
    // h-full.
    const slotRegion = /const terminalSlot = ([\s\S]*?)<TerminalView/.exec(
      workspace,
    );
    expect(
      slotRegion,
      "TerminalView rendered inside the terminalSlot binding",
    ).toBeTruthy();
    expect(
      slotRegion![1],
      "no padded wrapper between terminalSlot and TerminalView",
    ).not.toMatch(/className="[^"]*\b[pm][xytrbl]?-/);
    // Anchor the wrapper check to `<div className="h-full">{terminalSlot}</div>` specifically —
    // the h-full is load-bearing (FitAddon needs a sized parent) and uniquely identifies the
    // terminal wrapper. Also assert there is exactly one `>{terminalSlot}` occurrence so no
    // sibling wrapper can silently shadow this match.
    const wrapMatches = [...workspace.matchAll(/>(\{terminalSlot\})/g)];
    expect(
      wrapMatches,
      "exactly one element renders {terminalSlot}",
    ).toHaveLength(1);
    const wrapM =
      /className="([^"]*\bh-full\b[^"]*)"[^>]*>\{terminalSlot\}/.exec(
        workspace,
      );
    expect(wrapM, "CenterView terminal wrapper has h-full class").toBeTruthy();
    expect(
      wrapM![1],
      "no outer padding/margin on the terminal wrapper",
    ).not.toMatch(/\b[pm][xytrbl]?-/);
  });
});
