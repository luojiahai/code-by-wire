/**
 * macOS Tahoe (26) auto-masks every Dock icon to a uniform squircle; earlier macOS versions
 * don't, so the full-bleed build/icon.png (see scripts/make-icon.mjs) renders there as a
 * hard-cornered square instead. Darwin kernel major 25 == macOS 26 Tahoe — Apple's 2025
 * marketing renumbering jumped 15 -> 26, but the underlying Darwin kernel just incremented
 * 24 -> 25 as usual. Matches hermes-agent's MACOS_TAHOE_DARWIN_MAJOR and vscode's
 * isTahoeOrNewer, both of which use this same Darwin-major convention (not Electron's
 * app.getSystemVersion() marketing-version string).
 */
export function isPreTahoeMacOS(darwinRelease: string): boolean {
  const major = parseInt(darwinRelease, 10);
  return Number.isFinite(major) && major < 25;
}
