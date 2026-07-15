/** Warm the bundled JetBrains Mono faces before a terminal's first open. Kept deviation
 *  from vscode (spec §7.1): vscode's terminal uses system fonts and never touches
 *  document.fonts; we bundle a webfont, and without the warm-up the WebGL atlas bakes
 *  fallback-face glyphs (terminal renders thin until a repaint) and the font probe
 *  measures fallback metrics. Best-effort: always resolves. */
export function warmTerminalFonts(fontSizePx: number): Promise<unknown> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.load) return Promise.resolve([]);
  return Promise.allSettled(
    ["400", "700", "italic 400"].map((variant) =>
      fonts.load(`${variant} ${fontSizePx}px 'JetBrains Mono Variable'`),
    ),
  );
}
