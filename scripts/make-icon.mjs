// Renders build/icon.svg to a 1024x1024 transparent PNG using the already-installed
// Electron/Chromium. No external image tooling required. electron-builder converts the
// PNG to platform icons at build time. Run: pnpm run icon
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
const html =
  '<!doctype html><meta charset="utf-8">' +
  "<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>" +
  svg;

app.disableHardwareAcceleration();
// Render at 2x everywhere, not just on Retina, so the downscale below always supersamples.
app.commandLine.appendSwitch("force-device-scale-factor", "2");

app.whenReady().then(async () => {
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

  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));

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
  writeFileSync(join(root, "build", "icon.png"), image.toPNG());
  console.log("wrote build/icon.png");
  app.quit();
});
