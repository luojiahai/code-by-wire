/**
 * The host-platform check, owned in one place. Both the renderer (header chrome, terminal key
 * bindings) and the main process read `process.platform` / `window.api.platform` and ask the same
 * question — "is this macOS?" — so the `=== 'darwin'` rule lives here instead of being re-spelled at
 * each call site, where one copy could drift from the rest.
 */

/** True when a platform string (`process.platform` or `window.api.platform`) is macOS. */
export const isMacPlatform = (platform: string): boolean =>
  platform === "darwin";

/** The three OS families the terminal key bindings distinguish. */
export type OsKind = "mac" | "windows" | "linux";

/** Collapse a platform string (`process.platform` / `window.api.platform`) to its OS family —
 *  "linux" covers every non-mac, non-win32 unix. Needed where mac-vs-not isn't enough: the terminal
 *  clipboard keys follow VS Code's per-OS bindings (plain Ctrl+V pastes on Windows but must stay the
 *  0x16 verbatim-insert byte on Linux). */
export const osKind = (platform: string): OsKind =>
  platform === "darwin" ? "mac" : platform === "win32" ? "windows" : "linux";

/** Normalize a path's separators to forward slashes — for cross-platform substring matching (install-method
 *  heuristics) and for the forward-slash paths PowerShell prefers. Owned here so the one regex doesn't drift
 *  between the cli-status and settings layers. */
export const toPosixPath = (path: string): string => path.replace(/\\/g, "/");
