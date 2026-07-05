import { WebLinksAddon } from "@xterm/addon-web-links";

/**
 * WebLinksAddon with an explicit activate handler routing through the app's http(s)-guarded
 * IPC.openExternal. cbw's main has no setWindowOpenHandler, so the addon's default window.open
 * would open a raw Electron window instead of the user's browser. Only http(s):// URLs linkify —
 * that's all the addon detects — and the main handler re-guards the scheme.
 */
export function createWebLinksAddon(
  openExternal: (url: string) => void,
): WebLinksAddon {
  return new WebLinksAddon((_event, uri) => openExternal(uri));
}
