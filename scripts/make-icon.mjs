// Renders build/icon.svg to transparent 1024x1024 PNGs using the already-installed
// Electron/Chromium. No external image tooling required. electron-builder converts the
// PNGs to platform icons at build time. Run: pnpm run icon
//
// Two outputs from the one source:
//   build/icon.png      — macOS/Linux. Full bleed: the dark tile fills the whole canvas, opaque to
//                         every edge (no margin, no rounded corners). macOS Tahoe (26) masks every
//                         icon to one uniform squircle and keys off edge-pixel alpha: >=253 it clips
//                         the art to a full-size squircle, <=252 it shrinks the art into a grey "icon
//                         jail" frame. A baked-in grid margin (transparent edges) gets jailed and
//                         renders small, so we hand Tahoe a full-bleed square and let the system
//                         supply the corners. On macOS <=15 (no masking) this shows as a hard-cornered
//                         square, which is the accepted cost of the approach.
//   build/icon-win.png  — Windows. Same artwork re-cropped to the tile's exact bounds, keeping the
//                         tile's rounded corners. Windows draws icons as-is with no rounded-rect
//                         frame, so it needs the rounding baked in.
//
// Forces a 2x device scale and downscales, so the result is crisp regardless of the
// host's display (a 1x monitor would otherwise rasterize 1:1 with no supersampling),
// and waits for a real composited frame instead of a fixed timer.
import { app, BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "build", "icon.svg"), "utf8");
// Crop the viewBox to the tile's exact bounds (x/y 100, 824x824) so the artwork runs edge-to-edge
// instead of sitting in the old macOS grid margin.
const crop = (s) =>
  s.replace('viewBox="0 0 1024 1024"', 'viewBox="100 100 824 824"');

// Windows: rounded tile, edge-to-edge. Keep the rounded clip and the hairline border.
const svgWin = crop(svg);

// macOS/Linux: full bleed. Drop the rounded clip and the hairline border so the gradient fills the
// canvas as a plain opaque square — every edge pixel, corners included, lands at alpha 255. That's
// what keeps Tahoe from shrinking the icon into its grey "icon jail" frame (it rounds the corners
// itself via the system squircle mask).
const svgMac = crop(svg)
  .replace('<g clip-path="url(#tileClip)">', "<g>")
  .replace(
    '<rect x="101.5" y="101.5" width="821" height="821" rx="183.5" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="3"/>',
    "",
  );

const htmlFor = (src) =>
  '<!doctype html><meta charset="utf-8">' +
  "<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>" +
  src;

app.disableHardwareAcceleration();
// Render at 2x everywhere, not just on Retina, so the downscale below always supersamples.
app.commandLine.appendSwitch("force-device-scale-factor", "2");

app.whenReady().then(async () => {
  // One reused window for both captures: creating a second transparent frameless window after destroying
  // the first fails to load on Windows (ERR_FAILED), so navigate the same window instead.
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    // Keep rAF/timers running even though the window is never shown, so the paint
    // signal below actually fires.
    webPreferences: { offscreen: false, backgroundThrottling: false },
  });

  async function capture(svgSrc) {
    await win.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(htmlFor(svgSrc)),
    );
    // Wait for two composited frames (a real paint), with a timeout so a missed signal
    // degrades to "capture anyway" rather than hanging the script.
    const painted = win.webContents.executeJavaScript(
      "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))",
    );
    await Promise.race([painted, new Promise((r) => setTimeout(r, 5000))]);

    let image = await win.webContents.capturePage();
    if (image.getSize().width !== SIZE) {
      image = image.resize({ width: SIZE, height: SIZE, quality: "best" });
    }
    return image.toPNG();
  }

  writeFileSync(join(root, "build", "icon.png"), await capture(svgMac));
  console.log("wrote build/icon.png");
  writeFileSync(join(root, "build", "icon-win.png"), await capture(svgWin));
  console.log("wrote build/icon-win.png");
  win.destroy();
  app.quit();
});
