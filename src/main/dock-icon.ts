import { nativeImage, type App } from "electron";
import { release } from "node:os";
import { DOCK_ICON_LEGACY_DATA_URL } from "./dock-icon-legacy-asset";

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

/**
 * Swaps the running app's Dock icon to the traditional padded/rounded style on pre-Tahoe
 * macOS, leaving Tahoe (and Windows/Linux) on the full-bleed icon.icns baked into the bundle.
 * Only the live Dock icon can differ by OS version this way — Finder/Spotlight/Get Info/the
 * DMG all read the one static bundle icon and can't.
 */
export function applyLegacyDockIconIfNeeded(app: App): void {
  if (process.platform !== "darwin") return;
  if (!isPreTahoeMacOS(release())) return;
  app.dock?.setIcon(nativeImage.createFromDataURL(DOCK_ICON_LEGACY_DATA_URL));
}
