import type { ITheme } from "@xterm/xterm";

/** VS Code's default integrated-terminal DARK palette (terminalColorRegistry.ts) — a fixed table,
 *  not luminance-derived. cbw is dark-only (a single :root theme block), so the light table and
 *  hermes' terminalTheme(mode) switching are deliberately omitted; if cbw ever grows a light
 *  theme, port those then (hermes selection.ts:33-79 + its re-theme effect). */
const DARK_THEME: ITheme = {
  background: "#1e1e1e",
  foreground: "#cccccc",
  cursor: "#cccccc",
  cursorAccent: "#1e1e1e",
  selectionBackground: "#264f7866",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

export function terminalTheme(): ITheme {
  return DARK_THEME;
}

/** Resolve --ui-editor-surface-background to a concrete rgb for the WebGL renderer + contrast
 *  clamp. Custom props don't resolve via getComputedStyle, so probe a real background-color. */
export function resolveSurfaceColor(fallback: string): string {
  if (typeof document === "undefined" || !document.body) return fallback;
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;background-color:var(--ui-editor-surface-background)";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return resolved && resolved !== "rgba(0, 0, 0, 0)" ? resolved : fallback;
}
