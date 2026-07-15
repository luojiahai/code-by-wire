import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { terminalTheme } from "../../src/renderer/src/xterm/terminal-theme";

// Read the renderer theme as text — no DOM, no xterm import (that file pulls in the DOM-bound lib).
const root = join(__dirname, "..", "..");
const css = readFileSync(join(root, "src/renderer/src/index.css"), "utf8");

/** Parse "#rrggbb" -> [r, g, b]. */
function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a 6-digit hex: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** Channel spread (max - min). 0 is a perfectly neutral grey; any temperature pushes it up. */
function spread(hex: string): number {
  const [r, g, b] = rgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** Extract a `--<name>: <value>;` declaration's raw right-hand side — the FIRST such declaration in
 *  the file, i.e. the base `:root`/`@theme` block, not a later `[data-theme="light"]` override. */
function rawVar(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`custom property --${name} not found in index.css`);
  return m[1].trim();
}

/** Resolve a token's value down to a literal #hex, following `var(--x)` indirection (through as
 *  many layers as needed — e.g. --color-fg -> --ui-text-primary -> --ui-base -> --theme-foreground)
 *  until a literal hex is reached. */
function resolveToHex(expr: string): string {
  const varMatch = /var\(--([a-z0-9-]+)\)/i.exec(expr);
  if (varMatch) return resolveToHex(rawVar(varMatch[1]));
  const hex = /#[0-9a-fA-F]{6}/.exec(expr);
  if (hex) return hex[0];
  throw new Error(`could not resolve a hex color from: ${expr}`);
}

/** Read a `--color-<name>` token all the way down to its literal hex value. */
function token(name: string): string {
  return resolveToHex(rawVar(`color-${name}`));
}

/** Extract a `--<name>: <value>;` declaration's raw right-hand side specifically from within the
 *  `:root[data-theme="light"]` override block (not the base :root block above it). */
function lightVar(name: string): string {
  const block = /:root\[data-theme="light"\]\s*\{([^}]*)\}/.exec(css);
  if (!block) throw new Error('no :root[data-theme="light"] block found');
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block[1]);
  if (!m) throw new Error(`--${name} not found in the light override block`);
  return m[1].trim();
}

// The surface/border stack — the "background colors", darkest to lightest. ink-600 is excluded:
// it is the Ended status hue (a deliberately cool slate), not a surface.
const SURFACE_STACK = [
  "well",
  "ink-950",
  "ink-925",
  "ink-900",
  "ink-850",
  "ink-800",
  "ink-750",
  "ink-700",
] as const;

describe("cockpit theme — graphite surfaces (not warm, not cool)", () => {
  it("every surface/border token is neutral graphite (channel spread <= 1)", () => {
    for (const name of SURFACE_STACK) {
      const hex = token(name);
      expect(
        spread(hex),
        `--color-${name} (${hex}) should be neutral graphite`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("surfaces get strictly lighter from well -> ink-700", () => {
    const lum = SURFACE_STACK.map((n) => rgb(token(n))[0]); // near-equal RGB (spread <= 1), so the red channel tracks lightness
    for (let i = 1; i < lum.length; i++) {
      expect(
        lum[i],
        `${SURFACE_STACK[i]} should be lighter than ${SURFACE_STACK[i - 1]}`,
      ).toBeGreaterThan(lum[i - 1]);
    }
  });

  it("scrollbar chrome is graphite too", () => {
    // The native scrollbar thumb is `color-mix(in srgb, var(--ui-accent) N%, transparent)` via the
    // global scrollbar-color rule (the webkit thumb rules were dead in Chromium ≥121 and are gone)
    // rather than a literal hex, so assert on the resolved --ui-accent chain instead: it aliases
    // to --theme-midground, which must itself be neutral graphite.
    const thumbs = [
      ...css.matchAll(
        /scrollbar-color:\s*color-mix\(in srgb,\s*var\(--ui-accent\)/g,
      ),
    ];
    expect(
      thumbs.length,
      "expected the native thumb color keyed off --ui-accent",
    ).toBeGreaterThanOrEqual(1);
    const midground = /--theme-midground:\s*(#[0-9a-fA-F]{6})/.exec(css);
    expect(midground, "--theme-midground hex").toBeTruthy();
    expect(
      spread(midground![1]),
      `--theme-midground (${midground![1]}) should be neutral graphite`,
    ).toBeLessThanOrEqual(1);
  });

  it("status hues stay chromatic; the wire accent was intentionally greyed out (hermes Mono)", () => {
    // hermes's Mono theme retires the teal brand accent — primary now aliases straight to the
    // grayscale foreground (see index.css:3-5) — while Working/Waiting keep their state hues.
    expect(
      spread(token("primary")),
      "primary (now = foreground)",
    ).toBeLessThanOrEqual(1);
    expect(spread(token("working")), "teal Working").toBeGreaterThan(20);
    expect(spread(token("accent")), "amber Waiting").toBeGreaterThan(20);
  });
});

describe("shared terminal theme chrome matches the terminal-pane tokens", () => {
  it("dark background is graphite and equals --terminal-editor-surface-background (canvas == inset == frame)", () => {
    const bg = terminalTheme("dark").background!;
    expect(spread(bg)).toBeLessThanOrEqual(1);
    expect(bg.toLowerCase()).toBe(
      resolveToHex(rawVar("terminal-editor-surface-background")).toLowerCase(),
    );
  });

  it("dark foreground is neutral graphite", () => {
    expect(spread(terminalTheme("dark").foreground!)).toBeLessThanOrEqual(1);
  });

  it("light background is #ffffff", () => {
    expect(terminalTheme("light").background!.toLowerCase()).toBe("#ffffff");
  });
});

describe("terminal-pane chrome tokens follow Terminal theme, not App theme", () => {
  // Regression coverage for the 2026-07-15 terminal-retheme fix: --terminal-editor-surface-background
  // and --terminal-well-background were introduced so the terminal's own inset (instance.tsx's
  // padding, directly touching the xterm canvas) and the observed-session container follow
  // $terminalTheme instead of App theme. Their literals were chosen to match specific sources of
  // truth "exactly" per the fix's own CSS comments — pin that relationship here so a future edit to
  // any one side can't silently desync from the others.
  //
  // Deliberately NOT Terminal-themed (an earlier version of this fix moved these too, then reverted
  // it same-day): the Pane's outer wrapper, the tab rail, and the persistent overlay all stay on the
  // plain App-theme --ui-editor-surface-background alias — see that token's own comment in index.css.

  /** Extract a `--<name>: <value>;` declaration's raw right-hand side specifically from within the
   *  `:root[data-terminal-theme="light"]` override block. */
  function terminalLightVar(name: string): string {
    const block = /:root\[data-terminal-theme="light"\]\s*\{([^}]*)\}/.exec(
      css,
    );
    if (!block)
      throw new Error('no :root[data-terminal-theme="light"] block found');
    const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block[1]);
    if (!m)
      throw new Error(
        `--${name} not found in the terminal light override block`,
      );
    return m[1].trim();
  }

  it("dark --terminal-editor-surface-background equals --theme-neutral-chrome (blended look unchanged when both themes are dark)", () => {
    expect(rawVar("terminal-editor-surface-background").toLowerCase()).toBe(
      rawVar("theme-neutral-chrome").toLowerCase(),
    );
  });

  it("--ui-editor-surface-background stays a plain App-theme alias, NOT the Terminal-theme token (rail/Pane/overlay stay App-themed)", () => {
    expect(rawVar("ui-editor-surface-background")).toBe("var(--ui-bg-chrome)");
  });

  it("dark --terminal-well-background equals the shared terminal theme's dark background", () => {
    expect(rawVar("terminal-well-background").toLowerCase()).toBe(
      terminalTheme("dark").background!.toLowerCase(),
    );
  });

  it("light overrides for both terminal-chrome tokens equal the shared light background", () => {
    const light = terminalTheme("light").background!.toLowerCase();
    expect(light).toBe("#ffffff");
    expect(
      terminalLightVar("terminal-editor-surface-background").toLowerCase(),
    ).toBe(light);
    expect(terminalLightVar("terminal-well-background").toLowerCase()).toBe(
      light,
    );
  });
});

describe("electron window matches the theme", () => {
  it("WINDOW_BACKGROUND.dark is graphite and equals --color-ink-950", () => {
    const main = readFileSync(join(root, "src/main/index.ts"), "utf8");
    const m = /WINDOW_BACKGROUND[^}]*dark:\s*"(#[0-9a-fA-F]{6})"/.exec(main);
    expect(m, "WINDOW_BACKGROUND.dark hex").toBeTruthy();
    expect(spread(m![1])).toBeLessThanOrEqual(1);
    expect(m![1].toLowerCase()).toBe(token("ink-950").toLowerCase());
  });

  it("WINDOW_BACKGROUND.light is a light literal", () => {
    const main = readFileSync(join(root, "src/main/index.ts"), "utf8");
    const m = /WINDOW_BACKGROUND[^}]*light:\s*"(#[0-9a-fA-F]{6})"/.exec(main);
    expect(m, "WINDOW_BACKGROUND.light hex").toBeTruthy();
    expect(m![1].toLowerCase()).toBe("#ffffff");
  });
});

describe("packaged build renders sRGB (mascot color matches dev)", () => {
  it("forces the sRGB color profile in the main process", () => {
    const main = readFileSync(join(root, "src/main/index.ts"), "utf8");
    // Without this switch the packaged build inherits the display's wide-gamut (P3) profile and
    // oversaturates the sRGB-authored palette; dev already renders sRGB, so this makes them match.
    expect(main).toMatch(
      /appendSwitch\(\s*['"]force-color-profile['"]\s*,\s*['"]srgb['"]\s*\)/,
    );
  });
});

describe("token consolidation (no duplicate light-blind literals)", () => {
  it("--color-primary aliases --theme-primary instead of duplicating a literal", () => {
    expect(rawVar("color-primary")).toBe("var(--theme-primary)");
  });

  it("--color-fg/-fg-muted/-fg-faint alias the --ui-text-* tiers instead of duplicating a literal", () => {
    expect(rawVar("color-fg")).toBe("var(--ui-text-primary)");
    expect(rawVar("color-fg-muted")).toBe("var(--ui-text-secondary)");
    expect(rawVar("color-fg-faint")).toBe("var(--ui-text-tertiary)");
  });

  it("--color-ink-950/-925 alias the chrome/card neutrals instead of duplicating a literal", () => {
    expect(rawVar("color-ink-950")).toBe("var(--theme-neutral-chrome)");
    expect(rawVar("color-ink-925")).toBe("var(--theme-neutral-card)");
  });

  it("--color-primary-bright/-deep are exact per-mode literals, not a color-mix formula", () => {
    expect(token("primary-bright")).toBe("#ffffff");
    expect(token("primary-deep")).toBe("#c8c8c8");
    expect(lightVar("color-primary-bright")).toBe("#2e2e2e");
    expect(lightVar("color-primary-deep")).toBe("#000000");
  });
});

describe("light theme overrides", () => {
  it("light foreground/primary invert to near-black, mirroring dark's own foreground=primary rule", () => {
    expect(lightVar("theme-foreground")).toBe("#161616");
    expect(lightVar("theme-primary")).toBe("#161616");
  });

  it("light neutrals are near-white surfaces", () => {
    expect(lightVar("theme-neutral-chrome")).toBe("#ffffff");
    expect(lightVar("theme-neutral-sidebar")).toBe("#f5f5f5");
    expect(lightVar("theme-neutral-card")).toBe("#ffffff");
  });

  it("light red/green/cyan use hermes-agent's light-mode hues, distinct from the dark overrides", () => {
    expect(lightVar("ui-red")).toBe("#cf2d56");
    expect(lightVar("ui-green")).toBe("#1f8a65");
    expect(lightVar("ui-cyan")).toBe("#4c7f8c");
  });
});
