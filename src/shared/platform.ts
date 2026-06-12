/**
 * The host-platform check, owned in one place. Both the renderer (header chrome, terminal key
 * bindings) and the main process read `process.platform` / `window.api.platform` and ask the same
 * question — "is this macOS?" — so the `=== 'darwin'` rule lives here instead of being re-spelled at
 * each call site, where one copy could drift from the rest.
 */

/** True when a platform string (`process.platform` or `window.api.platform`) is macOS. */
export const isMacPlatform = (platform: string): boolean =>
  platform === "darwin";
